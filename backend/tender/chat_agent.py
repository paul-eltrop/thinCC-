# Tender-Chat-Agent: bestimmt die naechste offene Anforderung, baut den
# System-Prompt fuer GPT-4o, persistiert User-Antworten direkt als
# user_provided coverage und rerankt nach jeder Antwort.

from dataclasses import dataclass
from typing import Optional

from haystack.dataclasses import Document

from chat.agent import ChatMessage
from pipeline import retrieve
from tender.coverage import SCAN_SCORE_THRESHOLD
from tender.ranking import compute_ranking
from tender.state import (
    Requirement,
    RequirementCoverage,
    Tender,
    TenderRanking,
    load_tender,
    save_tender,
)

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


def _gather_hints(requirement: Requirement) -> list[Document]:
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

KONTEXT (Tender: {tender.filename}):
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


def _persist_user_answer(tender: Tender, requirement_id: str, answer: str) -> None:
    requirement = next((r for r in tender.requirements if r.id == requirement_id), None)
    if not requirement:
        return

    tender.coverage[requirement_id] = RequirementCoverage(
        requirement_id=requirement_id,
        status="covered",
        confidence=1.0,
        evidence=answer,
        sources=[{"source_file": "tender_chat", "score": 1.0}],
        user_provided=True,
        notes=None,
    )
    tender.ranking = compute_ranking(tender.requirements, tender.coverage)
    save_tender(tender)


def prepare_turn(
    tender_id: str,
    history: list[ChatMessage],
    current_requirement_id: Optional[str],
) -> tuple[Optional[Tender], TenderNextTurn]:
    tender = load_tender(tender_id)
    if tender is None:
        return None, TenderNextTurn(
            current_requirement_id=None,
            done=True,
            system_prompt="Tender nicht gefunden.",
            ranking=None,
        )

    if current_requirement_id and history and history[-1].role == "user":
        answer = history[-1].content.strip()
        if answer:
            _persist_user_answer(tender, current_requirement_id, answer)

    open_list = _open_requirements(tender)
    if not open_list:
        return tender, TenderNextTurn(
            current_requirement_id=None,
            done=True,
            system_prompt=DONE_PROMPT,
            ranking=tender.ranking,
        )

    next_requirement = open_list[0]
    hints = _gather_hints(next_requirement)
    system_prompt = _build_system_prompt(tender, next_requirement, open_list, hints)

    return tender, TenderNextTurn(
        current_requirement_id=next_requirement.id,
        done=False,
        system_prompt=system_prompt,
        ranking=tender.ranking,
    )
