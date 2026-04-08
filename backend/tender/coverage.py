# Coverage-Scan fuer Tender-Anforderungen: pro Requirement RAG-Chunks ziehen
# und Gemini bewerten lassen ob abdeckbar. Spiegelt company.scanner, schreibt
# aber RequirementCoverage statt QuestionState.

import json

from llm_utils import call_gemini_json
from pipeline import retrieve
from tender.state import Requirement, RequirementCoverage

EVAL_MODEL = "gemini-2.5-flash"
SCAN_SCORE_THRESHOLD = 0.5
SCAN_TOP_K = 10

EVAL_PROMPT = """Du bist ein Reviewer der prueft ob eine Tender-Anforderung anhand
der gegebenen Quellen aus unserer Wissensbasis erfuellt werden kann.

Anforderung: {requirement}

Quellen aus der Wissensbasis:
{chunks}

Bewerte:
- "covered": Anforderung ist vollstaendig und eindeutig belegt
- "partial": Teile sind belegt, aber wesentliche Aspekte fehlen
- "missing": Anforderung kann nicht oder nur sehr vage belegt werden

Gib im Feld "evidence" eine kurze Begruendung (1-3 Saetze, faktenbasiert).
Bei "partial" oder "missing" notiere im Feld "notes" was konkret fehlt.

Antworte AUSSCHLIESSLICH als JSON mit diesem Schema:
{{
  "status": "covered" | "partial" | "missing",
  "evidence": string oder null,
  "confidence": float zwischen 0.0 und 1.0,
  "notes": string oder null
}}"""


def _format_chunks(chunks: list) -> str:
    if not chunks:
        return "(keine Quellen gefunden)"
    return "\n\n".join(
        f"[Quelle: {c.meta.get('source_file', 'unbekannt')} | Score: {c.score:.3f}]\n{c.content}"
        for c in chunks
    )


def _retrieve_for_requirement(requirement: Requirement) -> list:
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
        top_k=SCAN_TOP_K,
        score_threshold=SCAN_SCORE_THRESHOLD,
    )


def _evaluate(requirement: Requirement, chunks: list) -> dict:
    if not chunks:
        return {
            "status": "missing",
            "evidence": None,
            "confidence": 0.0,
            "notes": "Keine relevanten Chunks im RAG gefunden.",
        }

    prompt = EVAL_PROMPT.format(
        requirement=requirement.text,
        chunks=_format_chunks(chunks),
    )
    raw = call_gemini_json(EVAL_MODEL, prompt)
    parsed = json.loads(raw)
    return {
        "status": parsed.get("status", "missing"),
        "evidence": parsed.get("evidence"),
        "confidence": float(parsed.get("confidence", 0.0)),
        "notes": parsed.get("notes"),
    }


def check_requirement(requirement: Requirement) -> RequirementCoverage:
    chunks = _retrieve_for_requirement(requirement)
    evaluation = _evaluate(requirement, chunks)

    sources = [
        {"source_file": c.meta.get("source_file", "unbekannt"), "score": float(c.score)}
        for c in chunks
    ]

    return RequirementCoverage(
        requirement_id=requirement.id,
        status=evaluation["status"],
        confidence=evaluation["confidence"],
        evidence=evaluation["evidence"],
        sources=sources,
        user_provided=False,
        notes=evaluation["notes"],
    )


def scan_requirements(
    requirements: list[Requirement],
    existing: dict[str, RequirementCoverage] | None = None,
) -> dict[str, RequirementCoverage]:
    """Scannt alle Requirements sequenziell. user_provided=True Eintraege werden
    nicht ueberschrieben. Einzelne Fehler werden als 'missing' markiert."""
    existing = existing or {}
    result: dict[str, RequirementCoverage] = {}

    for req in requirements:
        prev = existing.get(req.id)
        if prev and prev.user_provided:
            result[req.id] = prev
            continue

        try:
            result[req.id] = check_requirement(req)
        except Exception as err:
            result[req.id] = RequirementCoverage(
                requirement_id=req.id,
                status="missing",
                confidence=0.0,
                evidence=None,
                sources=[],
                user_provided=False,
                notes=f"Scan-Fehler: {type(err).__name__}: {err}",
            )

    return result
