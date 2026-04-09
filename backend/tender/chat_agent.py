# Tender-Chat-Agent: bestimmt die naechste offene Anforderung, baut den
# System-Prompt fuer GPT-4o, persistiert User-Antworten direkt als
# user_provided coverage und rerankt nach jeder Antwort.

from dataclasses import dataclass
from typing import Optional

from haystack.dataclasses import Document

from chat.agent import ChatMessage
from pipeline import retrieve
from tender.coverage import SCAN_SCORE_THRESHOLD
from tender.db import (
    Requirement,
    RequirementCoverage,
    Tender,
    TenderRanking,
    load_tender_full,
    update_tender_scan_meta,
    upsert_coverage,
)
from tender.ranking import compute_ranking

CHAT_RETRIEVE_TOP_K = 5
IMPORTANCE_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
STATUS_ORDER = {"missing": 0, "partial": 1, "covered": 2}

DONE_PROMPT = (
    "Alle relevanten Anforderungen sind abgedeckt. Du kannst den Tender-Chat "
    "jetzt beenden und die Promotion ausloesen."
)


@dataclass
class TenderNextTurn:
    current_requirement_id: Optional[str]
    done: bool
    system_prompt: str
    ranking: Optional[TenderRanking]


def _open_requirements(tender: Tender) -> list[Requirement]:
    open_list = []
    for req in tender.requirements:
        cov = tender.coverage.get(req.id)
        if cov and cov.status == "covered":
            continue
        open_list.append(req)

    def sort_key(req: Requirement) -> tuple[int, int]:
        cov = tender.coverage.get(req.id)
        status = cov.status if cov else "missing"
        return (IMPORTANCE_ORDER.get(req.importance, 99), STATUS_ORDER.get(status, 99))

    open_list.sort(key=sort_key)
    return open_list


def _gather_hints(requirement: Requirement, company_id: str) -> list[Document]:
    filters = None
    if requirement.related_doc_types:
        allowed = list(requirement.related_doc_types) + ["qa_answer"]
        filters = {
            "field": "meta.doc_type",
            "operator": "in",
            "value": allowed,
        }

    return retrieve(
        requirement.text,
        company_id=company_id,
        filters=filters,
        top_k=CHAT_RETRIEVE_TOP_K,
        score_threshold=SCAN_SCORE_THRESHOLD,
    )


def _format_hints(hints: list[Document]) -> str:
    if not hints:
        return "(keine relevanten Treffer in der Wissensbasis)"
    return "\n".join(
        f"- [Quelle: {h.meta.get('source_file', 'unbekannt')}] {h.content.strip()}"
        for h in hints
    )


def _format_open(open_list: list[Requirement]) -> str:
    if not open_list:
        return "(keine)"
    return "\n".join(f"- [{r.importance}] {r.text}" for r in open_list)


def _build_system_prompt(
    tender: Tender,
    requirement: Requirement,
    open_list: list[Requirement],
    hints: list[Document],
) -> str:
    cov = tender.coverage.get(requirement.id)
    notes = cov.notes if cov and cov.notes else "(keine)"
    remaining = len(open_list)

    return f"""Du bist ein Bid Manager im Dialog mit dem Bewerber. Deine Aufgabe ist es,
gezielt Informationen einzusammeln um Luecken im Fit-Check zu schliessen.

REGELN:
- Stelle IMMER nur EINE Frage pro Nachricht.
- Sei kurz, freundlich, professionell. Keine langen Vortraege.
- Wenn die Wissensbasis schon Hinweise liefert, frage als Verifikation:
  "Ich habe X gefunden — passt das zu dieser Anforderung?"
- Wenn die Wissensbasis nichts hergibt, frage offen.
- Erwaehne kurz wieviele Luecken noch offen sind.

KONTEXT (Tender: {tender.name}):
Noch offene Anforderungen ({remaining} insgesamt):
{_format_open(open_list)}

AKTUELLE ANFORDERUNG:
ID: {requirement.id}
Importance: {requirement.importance}{" (KRITISCH)" if requirement.is_critical else ""}
Kategorie: {requirement.category}
Anforderung: {requirement.text}
Bisherige Notes: {notes}

VORWISSEN aus der Wissensbasis:
{_format_hints(hints)}

Stelle jetzt die Frage zu dieser Anforderung in einem Satz, ggf. mit
Verifikations-Hinweis falls oben Vorwissen steht."""


def _evaluate_answer(requirement_text: str, answer: str) -> tuple[str, float]:
    from openai import OpenAI
    import config
    client = OpenAI(api_key=config.OPENAI_API_KEY)

    response = client.chat.completions.create(
        model=config.LLM_MODEL,
        messages=[
            {"role": "system", "content": (
                "You evaluate whether a user's answer provides CONCRETE, VERIFIABLE information that addresses a tender requirement. "
                "Be STRICT. The answer must contain specific facts, numbers, names, dates, or detailed descriptions. "
                "Vague claims like 'I have experience in X' or 'We can do that' are NOT sufficient - they need proof or details. "
                "COVERED: Answer contains specific, concrete information (names, numbers, dates, project details). "
                "PARTIAL: Answer has some concrete info but is missing key details. "
                "MISSING: Answer is vague, just a claim without evidence, or irrelevant. "
                "Respond with EXACTLY one word on the first line: COVERED, PARTIAL, or MISSING. "
                "On the second line, a confidence score between 0.0 and 1.0. "
                "On the third line, explain briefly why."
            )},
            {"role": "user", "content": (
                f"Requirement: {requirement_text}\n\n"
                f"User's answer: {answer}\n\n"
                f"Does this answer provide concrete, verifiable information?"
            )},
        ],
    )

    text = response.choices[0].message.content.strip()
    lines = text.split("\n")
    status_word = lines[0].strip().upper() if lines else "MISSING"

    if "COVERED" in status_word:
        return "covered", float(lines[1].strip()) if len(lines) > 1 else 0.9
    if "PARTIAL" in status_word:
        return "partial", float(lines[1].strip()) if len(lines) > 1 else 0.5
    return "missing", 0.0


def _persist_user_answer(
    tender: Tender,
    requirement_id: str,
    answer: str,
) -> bool:
    requirement = next((r for r in tender.requirements if r.id == requirement_id), None)
    if not requirement:
        return False

    status, confidence = _evaluate_answer(requirement.text, answer)

    if status == "missing":
        return False

    new_cov = RequirementCoverage(
        requirement_id=requirement_id,
        status=status,
        confidence=confidence,
        evidence=answer,
        sources=[{"source_file": "tender_chat", "score": confidence}],
        user_provided=True,
        notes=None,
    )
    upsert_coverage(new_cov)
    tender.coverage[requirement_id] = new_cov

    new_ranking = compute_ranking(tender.requirements, tender.coverage)
    tender.ranking = new_ranking
    update_tender_scan_meta(
        tender.id,
        score=new_ranking.score,
        recommendation=new_ranking.recommendation,
        has_critical_gap=new_ranking.has_critical_gap,
        reasoning=new_ranking.reasoning,
    )
    return True


def prepare_turn(
    company_id: str,
    tender_id: str,
    history: list[ChatMessage],
    current_requirement_id: Optional[str],
) -> tuple[Optional[Tender], TenderNextTurn]:
    tender = load_tender_full(company_id, tender_id)
    if tender is None:
        return None, TenderNextTurn(
            current_requirement_id=None,
            done=True,
            system_prompt="Tender nicht gefunden.",
            ranking=None,
        )

    answer_accepted = True
    if current_requirement_id and history and history[-1].role == "user":
        answer = history[-1].content.strip()
        if answer:
            answer_accepted = _persist_user_answer(tender, current_requirement_id, answer)

    if not answer_accepted and current_requirement_id:
        rejected_req = next((r for r in tender.requirements if r.id == current_requirement_id), None)
        if rejected_req:
            open_list = _open_requirements(tender)
            reject_prompt = (
                f"Die letzte Antwort des Users reicht als Nachweis nicht aus fuer: "
                f"'{rejected_req.text}'. "
                f"Sage dem User klar: 'Das reicht uns leider als Beleg nicht aus.' "
                f"Dann biete genau ZWEI Optionen:\n"
                f"1. Ein Dokument hochladen (Referenzschreiben, Projektbericht, Zertifikat o.ae.) "
                f"ueber die Bueroklammer unten links.\n"
                f"2. Diese Anforderung ueberspringen und mit den anderen {len(open_list)} "
                f"offenen Anforderungen weitermachen.\n"
                f"WICHTIG: Frage NICHT nochmal nach der gleichen Info. "
                f"Maximal 2-3 Saetze, freundlich aber direkt."
            )
            return tender, TenderNextTurn(
                current_requirement_id=current_requirement_id,
                done=False,
                system_prompt=reject_prompt,
                ranking=tender.ranking,
            )

    open_list = _open_requirements(tender)
    if not open_list:
        return tender, TenderNextTurn(
            current_requirement_id=None,
            done=True,
            system_prompt=DONE_PROMPT,
            ranking=tender.ranking,
        )

    next_requirement = open_list[0]
    hints = _gather_hints(next_requirement, company_id)
    system_prompt = _build_system_prompt(tender, next_requirement, open_list, hints)

    return tender, TenderNextTurn(
        current_requirement_id=next_requirement.id,
        done=False,
        system_prompt=system_prompt,
        ranking=tender.ranking,
    )
