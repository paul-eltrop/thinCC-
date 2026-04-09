# Extrahiert Mitarbeiter-Namen + Rollen aus den indexierten Company-Dokumenten
# via Gemini Single-Shot. Gibt eine strukturierte Liste zurueck die der Route
# in Supabase merged.

import json

from llm_utils import call_gemini_json
from pipeline import retrieve

EXTRACT_MODEL = "gemini-2.5-flash"
EXTRACT_TOP_K = 80
EXTRACT_SCORE_THRESHOLD = 0.0

EXTRACT_PROMPT = """Du bekommst Auszuege aus Firmen-Dokumenten (CVs, Company Profiles, etc).
Extrahiere ALLE Personen die als Mitarbeiter dieses Unternehmens erwaehnt werden.
Ignoriere Kunden, Referenzen oder externe Personen.

Quellen:
{chunks}

Antworte AUSSCHLIESSLICH als JSON-Objekt mit Schema:
{{
  "employees": [
    {{
      "name": string,
      "role": string oder null,
      "seniority": "junior" | "mid" | "senior" | "lead" oder null,
      "source_files": [string]
    }}
  ]
}}"""


def _format_chunks(chunks: list) -> str:
    return "\n\n".join(
        f"[Quelle: {c.meta.get('source_file', 'unbekannt')} | Type: {c.meta.get('doc_type', '?')}]\n{c.content}"
        for c in chunks
    )


def extract_employees(company_id: str) -> list[dict]:
    """Holt relevante Chunks fuer die Company und laesst Gemini eine
    deduplizierte Mitarbeiter-Liste extrahieren."""
    chunks = retrieve(
        "Mitarbeiter Team Lebenslauf Senior Junior Berufserfahrung",
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
