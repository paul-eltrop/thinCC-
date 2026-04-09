# Extrahiert einen strukturierten Anforderungs-Katalog aus dem geparsten
# Tender-Text per Gemini Flash. Output ist eine Liste typisierter Requirements
# inkl. Importance-Ranking und is_critical-Flag fuer Deal-Breaker.

import json

from llm_utils import call_gemini_json
from tender.db import Requirement

EXTRACTOR_MODEL = "gemini-3.1-flash"
MAX_TENDER_CHARS = 60000
ALLOWED_CATEGORIES = {"compliance", "experience", "team", "technical", "commercial", "other"}
ALLOWED_IMPORTANCE = {"critical", "high", "medium", "low"}
ALLOWED_DOC_TYPES = {"cv", "reference_project", "methodology", "company_profile", "boilerplate", "qa_answer"}

EXTRACTION_PROMPT = """You are an experienced bid manager. Read the following
tender and extract all concrete requirements imposed on the bidder.

Rules:
- Extract only concrete, verifiable requirements — no generic descriptions.
- One requirement per entry, short and precisely phrased.
- At most 25 requirements.
- Rate importance:
  * "critical": must-have / KO criterion / eligibility criterion / mandatory
  * "high": heavily weighted selection criterion
  * "medium": standard requirement
  * "low": nice-to-have
- Set "is_critical": true ONLY if the requirement is explicitly phrased in
  the tender as a KO criterion, mandatory disclosure or minimum requirement.
- Categories:
  * "compliance": certificates, law, data protection, insurance, location
  * "experience": references, prior projects, industry experience
  * "team": headcount, qualifications, languages, availability
  * "technical": methodology, tools, technical capabilities
  * "commercial": price, conditions, contract model
  * "other": fits nowhere else
- "related_doc_types": list of internal document types that could support
  this requirement. Allowed values: cv, reference_project, methodology,
  company_profile, boilerplate, qa_answer. Leave empty if unclear.

Respond ONLY as a JSON object with this schema:
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

Tender:
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
