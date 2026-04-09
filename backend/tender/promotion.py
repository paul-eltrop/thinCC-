# Promotion: am Chat-Ende analysiert Gemini welche User-Antworten generische
# Company-Facts sind und schreibt diese als qa_answer-Documents in die
# Company-RAG, damit zukuenftige Tender davon profitieren.

import json

from company.rag_sync import write_qa_to_rag
from llm_utils import call_gemini_json
from tender.db import Tender

PROMOTION_MODEL = "gemini-2.5-flash"

PROMOTION_PROMPT = """You are a knowledge manager. Below are answers a bidder gave
during a tender chat. For each answer decide whether it is a generic company fact
(reusable for future tenders) or only relevant for this one tender.

Generic examples: "We have 12 senior consultants", "We are ISO 27001 certified",
"Our headquarters is in Berlin", "We offer training in German and English".

Tender-specific examples: "Yes, we can deliver this in 6 weeks",
"Our offer for this project is 120k", "We have resources free in Q3".

Answers:
{items}

Respond ONLY as JSON with this schema:
{{
  "decisions": [
    {{
      "requirement_id": "req_001",
      "promote": true | false,
      "fact": "Rephrased as a generic company fact (only when promote=true)"
    }}
  ]
}}"""


def _format_items(tender: Tender) -> tuple[str, dict[str, str]]:
    lines = []
    requirement_text: dict[str, str] = {}
    for req in tender.requirements:
        cov = tender.coverage.get(req.id)
        if not cov or not cov.user_provided or not cov.evidence:
            continue
        requirement_text[req.id] = req.text
        lines.append(
            f"- requirement_id: {req.id}\n  Requirement: {req.text}\n  Answer: {cov.evidence}"
        )
    return "\n".join(lines), requirement_text


def promote_answers(tender: Tender, company_id: str) -> list[str]:
    """Schickt alle user_provided-Antworten an Gemini, schreibt die als generisch
    markierten als qa_answer ins Company-RAG. Returnt Liste der promoteten requirement_ids."""
    items_text, requirement_text = _format_items(tender)
    if not items_text:
        return []

    prompt = PROMOTION_PROMPT.format(items=items_text)
    raw = call_gemini_json(PROMOTION_MODEL, prompt)
    parsed = json.loads(raw)

    promoted: list[str] = []
    for decision in parsed.get("decisions", []):
        req_id = decision.get("requirement_id")
        if not decision.get("promote") or req_id not in requirement_text:
            continue

        fact = (decision.get("fact") or "").strip()
        if not fact:
            continue

        synthetic_id = f"tender_promo_{tender.id}_{req_id}"
        write_qa_to_rag(company_id, synthetic_id, requirement_text[req_id], fact)
        promoted.append(req_id)

    return promoted
