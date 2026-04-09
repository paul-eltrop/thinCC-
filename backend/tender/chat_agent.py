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


def _format_covered_requirements(tender: Tender) -> str:
    covered = [r for r in tender.requirements if tender.coverage.get(r.id, RequirementCoverage()).status == "covered"]
    if not covered:
        return "(keine)"
    return "\n".join(f"- [{r.category}] {r.text}" for r in covered)


def _format_open_requirements_with_category_and_importance(open_list: list[Requirement]) -> str:
    if not open_list:
        return "(keine)"
    by_category: dict[str, list[Requirement]] = {}
    for req in open_list:
        cat = req.category or "Sonstiges"
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(req)
    
    lines = []
    for cat in sorted(by_category.keys()):
        lines.append(f"\n{cat}:")
        for req in by_category[cat]:
            critical = " (KRITISCH)" if req.is_critical else ""
            lines.append(f"  - [{req.importance}] {req.text}{critical}")
    return "\n".join(lines)


def _format_current_knowledge(tender: Tender) -> str:
    lines = []
    for req in tender.requirements:
        cov = tender.coverage.get(req.id)
        if cov and cov.evidence:
            lines.append(f"- {req.category}: {cov.evidence.strip()[:150]}")
    if not lines:
        return "(keine aktuellen Kenntnisse)"
    return "\n".join(lines)


def _build_system_prompt(
    tender: Tender,
    open_list: list[Requirement],
) -> str:
    covered_count = sum(1 for r in tender.requirements if tender.coverage.get(r.id, RequirementCoverage()).status == "covered")
    total_count = len(tender.requirements)
    open_count = len(open_list)
    
    critical_open = [r for r in open_list if r.is_critical]
    match_score = tender.ranking.score if tender.ranking else 0
    recommendation = tender.ranking.recommendation if tender.ranking else "unbekannt"

    return f"""Du bist ein erfahrener Bid Manager der mit dem Bewerber die Lücken
im Fit-Check für einen konkreten Tender durchgeht.

Dein Ziel: Alle offenen Anforderungen so effizient wie möglich
klären, damit der Draft generiert werden kann.

TENDER: {tender.name}
CLIENT: {tender.client}
DEADLINE: {tender.deadline}

FIT-CHECK ERGEBNIS:
Match-Score: {match_score}%
Abgedeckt: {covered_count} / {total_count} Anforderungen
Empfehlung: {recommendation}

ABGEDECKTE ANFORDERUNGEN (kein Handlungsbedarf):
{_format_covered_requirements(tender)}

OFFENE ANFORDERUNGEN ({open_count} verbleibend):
{_format_open_requirements_with_category_and_importance(open_list)}

BISHERIGES WISSEN AUS KB:
{_format_current_knowledge(tender)}

ABLAUF:
1. ZUSAMMENFASSUNG — Starte mit einem kurzen Überblick: Was passt
   schon gut, wo sind die Lücken, was ist kritisch. Gib dem User
   Orientierung bevor du fragst.
2. KRITISCHE LÜCKEN ZUERST — Wenn es kritische Anforderungen gibt
   (die den Draft blockieren), adressiere diese zuerst. Erkläre
   warum sie kritisch sind.
3. CLUSTER-FRAGEN — Gruppiere verwandte offene Anforderungen
   (z.B. alle Team-bezogenen, alle Methodik-bezogenen) und stelle
   eine zusammenfassende Frage pro Cluster statt Einzelfragen.
4. KONTEXT ANBIETEN — Wenn die KB Teilwissen hat, präsentiere es
   als Ausgangspunkt: "Aus euren vergangenen Proposals sehe ich
   dass ihr X gemacht habt. Lässt sich das auf diese Anforderung
   übertragen, oder gibt es hier einen anderen Ansatz?"
5. EXTRA-KONTEXT EINLADEN — Lade den User aktiv ein, Kontext zu
   geben den der Agent nicht kennt: "Gibt es Partnerschaften,
   laufende Projekte, oder interne Expertise die hier relevant
   sein könnten?"

REGELN:
- Frage NIEMALS nach Infos die schon abgedeckt sind.
- Leite aus dem Gespräch ab wo möglich, statt zu fragen. Wenn der
  User sagt "Wir arbeiten mit Firma Y zusammen", check sofort ob
  das andere offene Anforderungen mit abdeckt.
- Nach jeder Antwort: kurzes Update welche Lücken jetzt geschlossen
  sind und welche noch offen bleiben.
- Wenn alle kritischen Lücken geschlossen sind, sag das klar:
  "Die kritischen Anforderungen sind abgedeckt. Der Draft kann
  generiert werden. Es gibt noch {open_count - len(critical_open)} nicht-kritische Lücken —
  willst du die jetzt klären oder soll ich den Draft mit Platzhaltern
  für diese Stellen erstellen?"
- Sei ein Sparringspartner, kein Interviewer. Wenn du aus der KB
  einen Vorschlag ableiten kannst wie eine Lücke geschlossen werden
  könnte, mach den Vorschlag."""


def _persist_user_answer(
    tender: Tender,
    requirement_id: str,
    answer: str,
) -> None:
    requirement = next((r for r in tender.requirements if r.id == requirement_id), None)
    if not requirement:
        return

    new_cov = RequirementCoverage(
        requirement_id=requirement_id,
        status="covered",
        confidence=1.0,
        evidence=answer,
        sources=[{"source_file": "tender_chat", "score": 1.0}],
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
    system_prompt = _build_system_prompt(tender, open_list)

    return tender, TenderNextTurn(
        current_requirement_id=next_requirement.id,
        done=False,
        system_prompt=system_prompt,
        ranking=tender.ranking,
    )
