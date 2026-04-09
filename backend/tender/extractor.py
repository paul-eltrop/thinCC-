# Extrahiert einen strukturierten Anforderungs-Katalog aus dem geparsten
# Tender-Text per Gemini Flash. Output ist eine Liste typisierter Requirements
# inkl. Importance-Ranking und is_critical-Flag fuer Deal-Breaker.

import json

from llm_utils import call_gemini_json
from tender.db import Requirement

EXTRACTOR_MODEL = "gemini-2.5-flash"
MAX_TENDER_CHARS = 60000
ALLOWED_CATEGORIES = {"compliance", "experience", "team", "technical", "commercial", "other"}
ALLOWED_IMPORTANCE = {"critical", "high", "medium", "low"}
ALLOWED_DOC_TYPES = {"cv", "reference_project", "methodology", "company_profile", "boilerplate", "qa_answer"}

EXTRACTION_PROMPT = """Du bist ein erfahrener Bid Manager. Lies die folgende Ausschreibung
und extrahiere alle konkreten Anforderungen an den Bewerber.

Regeln:
- Extrahiere nur konkrete, pruefbare Anforderungen — keine allgemeinen Beschreibungen.
- Eine Anforderung pro Eintrag, kurz und praezise formuliert.
- Maximal 25 Anforderungen.
- Bewerte die Wichtigkeit:
  * "critical": MUSS-Kriterium / KO-Kriterium / Eignungskriterium / Pflichtangabe
  * "high": stark gewichtetes Auswahlkriterium
  * "medium": Standard-Anforderung
  * "low": Nice-to-have
- Setze "is_critical": true NUR wenn die Anforderung im Tender explizit als
  KO-Kriterium, Pflichtangabe oder Mindestanforderung formuliert ist.
- Kategorien:
  * "compliance": Zertifikate, Recht, Datenschutz, Versicherung, Standort
  * "experience": Referenzen, Vorprojekte, Branchenerfahrung
  * "team": Personalstaerke, Qualifikationen, Sprachen, Verfuegbarkeit
  * "technical": Methodik, Tools, technische Faehigkeiten
  * "commercial": Preis, Konditionen, Vertragsmodell
  * "other": passt in keine
- "related_doc_types": Liste der internen Dokumenttypen die diese Anforderung
  belegen koennten. Erlaubte Werte: cv, reference_project, methodology,
  company_profile, boilerplate, qa_answer. Leer lassen wenn unklar.

Antworte AUSSCHLIESSLICH als JSON-Objekt mit diesem Schema:
{{
  "requirements": [
    {{
      "text": "...",
      "category": "compliance" | "experience" | "team" | "technical" | "commercial" | "other",
      "importance": "critical" | "high" | "medium" | "low",
      "is_critical": true | false,
      "related_doc_types": ["cv", "reference_project", ...]
    }}
  ]
}}

Ausschreibung:
---
{tender_text}
---"""


def _normalize_doc_types(values: list) -> list[str]:
    if not isinstance(values, list):
        return []
    return [v for v in values if isinstance(v, str) and v in ALLOWED_DOC_TYPES]


def _normalize_requirement(idx: int, raw: dict) -> Requirement | None:
    text = (raw.get("text") or "").strip()
    if not text:
        return None

    category = raw.get("category", "other")
    if category not in ALLOWED_CATEGORIES:
        category = "other"

    importance = raw.get("importance", "medium")
    if importance not in ALLOWED_IMPORTANCE:
        importance = "medium"

    is_critical = bool(raw.get("is_critical", False))
    if importance == "critical":
        is_critical = True

    return Requirement(
        id=f"req_{idx + 1:03d}",
        text=text,
        category=category,
        importance=importance,
        is_critical=is_critical,
        related_doc_types=_normalize_doc_types(raw.get("related_doc_types", [])),
    )


def extract_requirements(parsed_text: str) -> list[Requirement]:
    """Schickt den Tender-Text an Gemini und gibt eine Liste von Requirements zurueck."""
    truncated = parsed_text[:MAX_TENDER_CHARS]
    prompt = EXTRACTION_PROMPT.format(tender_text=truncated)

    raw_response = call_gemini_json(EXTRACTOR_MODEL, prompt)
    parsed = json.loads(raw_response)

    requirements: list[Requirement] = []
    for idx, item in enumerate(parsed.get("requirements", [])):
        req = _normalize_requirement(idx, item)
        if req:
            requirements.append(req)

    return requirements
