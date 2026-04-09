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
    "All relevant requirements are covered. You can end the tender chat "
    "now and trigger the promotion."
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
        return "(no relevant matches in the knowledge base)"
    return "\n".join(
        f"- [source: {h.meta.get('source_file', 'unknown')}] {h.content.strip()}"
        for h in hints
    )


def _format_covered_requirements(tender: Tender) -> str:
    covered = []
    for r in tender.requirements:
        cov = tender.coverage.get(r.id)
        if cov and cov.status == "covered":
            covered.append(r)
    if not covered:
        return "(none)"
    return "\n".join(f"- [{r.category}] {r.text}" for r in covered)


def _format_open_by_category(open_list: list[Requirement]) -> str:
    if not open_list:
        return "(none)"

    by_category: dict[str, list[Requirement]] = {}
    for req in open_list:
        cat = req.category or "Other"
        by_category.setdefault(cat, []).append(req)

    lines = []
    for cat in sorted(by_category.keys()):
        lines.append(f"\n{cat}:")
        for req in by_category[cat]:
            critical = " (CRITICAL)" if req.is_critical else ""
            lines.append(f"  - [{req.importance}] {req.text}{critical}")
    return "\n".join(lines)


def _format_current_knowledge(tender: Tender) -> str:
    lines = []
    for req in tender.requirements:
        cov = tender.coverage.get(req.id)
        if cov and cov.evidence:
            lines.append(f"- {req.category}: {cov.evidence.strip()[:150]}")
    if not lines:
        return "(no knowledge collected yet)"
    return "\n".join(lines)


def _build_system_prompt(
    tender: Tender,
    open_list: list[Requirement],
    hints: list[Document],
) -> str:
    covered_count = sum(
        1 for r in tender.requirements
        if (cov := tender.coverage.get(r.id)) and cov.status == "covered"
    )
    total_count = len(tender.requirements)
    open_count = len(open_list)
    critical_open = [r for r in open_list if r.is_critical]

    match_score = tender.ranking.score if tender.ranking else 0
    recommendation = tender.ranking.recommendation if tender.ranking else "unknown"
    non_critical_open = open_count - len(critical_open)

    return f"""You are an experienced bid manager working with the applicant
to close gaps in the fit-check for a specific tender.

Your goal: clarify all open requirements as efficiently as possible so
the draft can be generated.

TENDER: {tender.name}
CLIENT: {tender.client}
DEADLINE: {tender.deadline}

FIT-CHECK RESULT:
Match score: {match_score}%
Covered: {covered_count} / {total_count} requirements
Recommendation: {recommendation}

COVERED REQUIREMENTS (no action needed):
{_format_covered_requirements(tender)}

OPEN REQUIREMENTS ({open_count} remaining):
{_format_open_by_category(open_list)}

CURRENT KNOWLEDGE FROM PRIOR ANSWERS:
{_format_current_knowledge(tender)}

ADDITIONAL CONTEXT FROM KNOWLEDGE BASE:
{_format_hints(hints)}

APPROACH:
1. SUMMARY — Start with a short overview: what already fits, where the
   gaps are, what is critical. Give the user orientation before asking.
2. CRITICAL GAPS FIRST — If there are critical requirements (which would
   block the draft), address them first. Explain why they are critical.
3. CLUSTER QUESTIONS — Group related open requirements (e.g. all
   team-related, all methodology-related) and ask one summarising
   question per cluster instead of individual questions.
4. OFFER CONTEXT — When the KB has partial knowledge, present it as a
   starting point: "From your past proposals I see that you did X. Does
   that translate to this requirement, or is there a different approach
   here?"
5. INVITE EXTRA CONTEXT — Actively invite the user to share context the
   agent doesn't know: "Are there partnerships, ongoing projects or
   internal expertise that could be relevant here?"

RULES:
- NEVER ask about info that is already covered.
- Derive from the conversation where possible instead of asking. If the
  user says "we work with company Y", immediately check whether that
  also covers other open requirements.
- After each answer: brief update on which gaps are now closed and
  which remain open.
- When all critical gaps are closed, say so clearly: "The critical
  requirements are covered. The draft can be generated. There are
  still {non_critical_open} non-critical gaps — do you want to clarify
  them now or should I generate the draft with placeholders for those
  spots?"
- Be a sparring partner, not an interviewer. If you can derive a
  proposal from the KB on how a gap could be closed, make that
  suggestion."""


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
            system_prompt="Tender not found.",
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
    hints = _gather_hints(next_requirement, company_id)
    system_prompt = _build_system_prompt(tender, open_list, hints)

    return tender, TenderNextTurn(
        current_requirement_id=next_requirement.id,
        done=False,
        system_prompt=system_prompt,
        ranking=tender.ranking,
    )
