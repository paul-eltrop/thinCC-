# Promotion: am Chat-Ende analysiert Gemini welche User-Antworten generische
# Company-Facts sind und schreibt diese als qa_answer-Documents in die
# Company-RAG, damit zukuenftige Tender davon profitieren.

import json

from company.rag_sync import write_qa_to_rag
from llm_utils import call_gemini_json
from tender.db import Tender

PROMOTION_MODEL = "gemini-2.5-flash"

PROMOTION_PROMPT = """Du bist ein Wissens-Manager. Unten siehst du Antworten, die ein
Bewerber waehrend eines Tender-Chats gegeben hat. Entscheide pro Antwort, ob sie
ein generischer Company-Fact ist (wiederverwendbar fuer zukuenftige Tender) oder
nur fuer diesen einen Tender relevant.

Generisch sind z.B.: "Wir haben 12 Senior Consultants", "Wir sind ISO 27001 zertifiziert",
"Unser Hauptsitz ist Berlin", "Wir bieten Trainings auf Deutsch und Englisch an".

Tender-spezifisch sind z.B.: "Ja, wir koennen das in 6 Wochen liefern",
"Unser Angebot fuer dieses Projekt liegt bei 120k", "Wir haben Ressourcen fuer Q3 frei".

Antworten:
{items}

Antworte AUSSCHLIESSLICH als JSON mit diesem Schema:
{{
  "decisions": [
    {{
      "requirement_id": "req_001",
      "promote": true | false,
      "fact": "Umformulierung als generischer Company-Fact (nur wenn promote=true)"
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
            f"- requirement_id: {req.id}\n  Anforderung: {req.text}\n  Antwort: {cov.evidence}"
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
