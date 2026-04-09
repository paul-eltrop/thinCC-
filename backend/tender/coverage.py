# Coverage-Scan fuer Tender-Anforderungen: pro Requirement RAG-Chunks ziehen
# und Gemini bewerten lassen ob abdeckbar. Parallelisiert ueber asyncio.gather
# mit Semaphore-Limit aus config. Spiegelt company.scanner.

import asyncio
import json

from llm_utils import call_gemini_json
from pipeline import retrieve
from tender.db import Requirement, RequirementCoverage

EVAL_MODEL = "gemini-2.5-flash"
SCAN_SCORE_THRESHOLD = 0.5
SCAN_TOP_K = 10

EVAL_PROMPT = """You are a reviewer checking whether a tender requirement can be
satisfied based on the given sources from our knowledge base.

Requirement: {requirement}

Sources from the knowledge base:
{chunks}

Rate as:
- "covered": requirement is fully and unambiguously supported
- "partial": parts are supported, but key aspects are missing
- "missing": requirement cannot be supported or only very vaguely

Give a short justification in the "evidence" field (1-3 sentences, fact-based).
For "partial" or "missing", note in the "notes" field what is specifically missing.

Respond ONLY as JSON with this schema:
{{
  "status": "covered" | "partial" | "missing",
  "evidence": string or null,
  "confidence": float between 0.0 and 1.0,
  "notes": string or null
}}"""


def _format_chunks(chunks: list) -> str:
    if not chunks:
        return "(no sources found)"
    return "\n\n".join(
        f"[source: {c.meta.get('source_file', 'unknown')} | score: {c.score:.3f}]\n{c.content}"
        for c in chunks
    )


def _retrieve_for_requirement(requirement: Requirement, company_id: str) -> list:
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
        top_k=SCAN_TOP_K,
        score_threshold=SCAN_SCORE_THRESHOLD,
    )


def _evaluate(requirement: Requirement, chunks: list) -> dict:
    if not chunks:
        return {
            "status": "missing",
            "evidence": None,
            "confidence": 0.0,
            "notes": "No relevant chunks found in RAG.",
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


def check_requirement(requirement: Requirement, company_id: str) -> RequirementCoverage:
    chunks = _retrieve_for_requirement(requirement, company_id)
    evaluation = _evaluate(requirement, chunks)

    sources = [
        {"source_file": c.meta.get("source_file", "unknown"), "score": float(c.score)}
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


async def check_requirement_async(
    requirement: Requirement,
    company_id: str,
    semaphore: asyncio.Semaphore,
) -> RequirementCoverage:
    """Async-Wrapper um check_requirement. Nutzt einen Semaphore-Slot und
    laeuft im Worker-Thread, damit Event-Loop frei bleibt. Fehler werden
    in eine 'missing'-Coverage gemappt."""
    async with semaphore:
        try:
            return await asyncio.to_thread(check_requirement, requirement, company_id)
        except Exception as err:
            return RequirementCoverage(
                requirement_id=requirement.id,
                status="missing",
                confidence=0.0,
                evidence=None,
                sources=[],
                user_provided=False,
                notes=f"Scan error: {type(err).__name__}: {err}",
            )
