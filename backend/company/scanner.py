# Scannt jede Question gegen den RAG: retrieve relevante Chunks, lass Gemini
# bewerten ob die Frage abdeckbar ist, und schreibe einen QuestionState.
# Parallelisiert ueber asyncio.gather mit Semaphore-Limit aus config.

import asyncio
import json

import config
from company.questions import Question
from company.state import QuestionState, now_iso
from llm_utils import call_gemini_json
from pipeline import retrieve

EVAL_MODEL = "gemini-3.1-flash"
SCAN_SCORE_THRESHOLD = 0.5
SCAN_TOP_K = 10

EVAL_PROMPT = """You are a reviewer checking whether a question can be answered
based on the given sources.

Question: {question}

Sources from the knowledge base:
{chunks}

Rate as:
- "covered": question is fully and unambiguously answerable
- "partial": parts of the question are covered, but key aspects are missing
- "missing": question cannot be answered or only very vaguely

Give a short answer when possible (1-3 sentences, fact-based from the sources).
For "partial" or "missing", note in the "notes" field what is specifically missing.

Respond ONLY as JSON with this schema:
{{
  "status": "covered" | "partial" | "missing",
  "answer": string or null,
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


def _evaluate_chunks(question: Question, chunks: list) -> dict:
    if not chunks:
        return {
            "status": "missing",
            "answer": None,
            "confidence": 0.0,
            "notes": "No relevant chunks found in RAG.",
        }

    prompt = EVAL_PROMPT.format(
        question=question.text,
        chunks=_format_chunks(chunks),
    )

    raw_response = call_gemini_json(EVAL_MODEL, prompt)
    parsed = json.loads(raw_response)
    return {
        "status": parsed.get("status", "missing"),
        "answer": parsed.get("answer"),
        "confidence": float(parsed.get("confidence", 0.0)),
        "notes": parsed.get("notes"),
    }


def scan_question(question: Question, company_id: str) -> QuestionState:
    """Retrievet Chunks fuer die Frage und laesst Gemini bewerten ob abdeckbar.
    Synchron — fuer parallele Ausfuehrung ueber scan_question_async."""
    filters = None
    if question.related_doc_types:
        allowed_types = list(question.related_doc_types) + ["qa_answer"]
        filters = {
            "field": "meta.doc_type",
            "operator": "in",
            "value": allowed_types,
        }

    chunks = retrieve(
        question.text,
        company_id=company_id,
        filters=filters,
        top_k=SCAN_TOP_K,
        score_threshold=SCAN_SCORE_THRESHOLD,
    )

    evaluation = _evaluate_chunks(question, chunks)

    sources = [
        {"source_file": c.meta.get("source_file", "unknown"), "score": float(c.score)}
        for c in chunks
    ]

    return QuestionState(
        question_id=question.id,
        status=evaluation["status"],
        answer=evaluation["answer"],
        confidence=evaluation["confidence"],
        sources=sources,
        user_provided=False,
        last_scanned=now_iso(),
        notes=evaluation["notes"],
    )


async def scan_question_async(
    question: Question,
    company_id: str,
    semaphore: asyncio.Semaphore,
) -> QuestionState:
    """Async-Wrapper um scan_question. Holt sich einen Slot aus dem Semaphor und
    fuehrt den blocking Scan in einem Worker-Thread aus, damit der Event-Loop
    nicht blockiert. Eigene Exceptions werden in einen 'missing'-State gemappt."""
    async with semaphore:
        try:
            return await asyncio.to_thread(scan_question, question, company_id)
        except Exception as err:
            return QuestionState(
                question_id=question.id,
                status="missing",
                answer=None,
                confidence=0.0,
                sources=[],
                user_provided=False,
                last_scanned=now_iso(),
                notes=f"Scan error: {type(err).__name__}: {err}",
            )


async def scan_all_questions(
    questions: list[Question],
    existing_state: dict[str, QuestionState],
    company_id: str,
) -> dict[str, QuestionState]:
    """Scannt alle Fragen parallel mit Semaphore-Limit. User-gegebene Antworten
    werden NICHT ueberschrieben. Einzelne Scan-Fehler werden bereits in
    scan_question_async als 'missing' gemappt."""
    semaphore = asyncio.Semaphore(config.SCAN_CONCURRENCY)
    tasks = [scan_question_async(q, company_id, semaphore) for q in questions]
    results = await asyncio.gather(*tasks)

    updated: dict[str, QuestionState] = {}
    for question, state in zip(questions, results):
        existing = existing_state.get(question.id)
        state.user_provided = bool(existing and existing.user_provided)
        updated[question.id] = state
    return updated
