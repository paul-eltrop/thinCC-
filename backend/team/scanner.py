# Extrahiert Mitarbeiter-Namen + Rollen aus den indexierten Company-Dokumenten
# via Gemini Single-Shot. Gibt eine strukturierte Liste zurueck die der Route
# in Supabase merged.

import json

from llm_utils import call_gemini_json
from pipeline import retrieve

EXTRACT_MODEL = "gemini-3.1-flash"
EXTRACT_TOP_K = 80
EXTRACT_SCORE_THRESHOLD = 0.0

EXTRACT_PROMPT = """You are given excerpts from company documents (CVs, company
profiles, etc). Extract ALL people mentioned as employees of this company.
Ignore clients, references or external people.

Sources:
{chunks}

Respond ONLY as a JSON object with the schema:
{{
  "employees": [
    {{
      "name": string,
      "role": string or null,
      "seniority": "junior" | "mid" | "senior" | "lead" or null,
      "source_files": [string]
    }}
  ]
}}"""


def _format_chunks(chunks: list) -> str:
    return "\n\n".join(
        f"[source: {c.meta.get('source_file', 'unknown')} | type: {c.meta.get('doc_type', '?')}]\n{c.content}"
        for c in chunks
    )


def extract_employees(company_id: str) -> list[dict]:
    """Holt relevante Chunks fuer die Company und laesst Gemini eine
    deduplizierte Mitarbeiter-Liste extrahieren."""
    chunks = retrieve(
        "Employee team CV resume senior junior work experience",
        company_id=company_id,
        filters={
            "field": "meta.doc_type",
            "operator": "in",
            "value": ["cv", "company_profile", "other"],
        },
        top_k=EXTRACT_TOP_K,
        score_threshold=EXTRACT_SCORE_THRESHOLD,
    )
    if not chunks:
        return []

    raw = call_gemini_json(
        EXTRACT_MODEL,
        EXTRACT_PROMPT.format(chunks=_format_chunks(chunks)),
    )
    parsed = json.loads(raw)
    employees = parsed.get("employees") or []
    return [e for e in employees if e.get("name")]
