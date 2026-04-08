# Scannt jede Question gegen den RAG: retrieve relevante Chunks, lass Gemini
# bewerten ob die Frage abdeckbar ist, und schreibe einen QuestionState.
# Sequenziell, blockend — fuer ~20 Fragen rund 30-60 Sekunden.

import json
import time

from google import genai
from google.genai import errors as genai_errors

import config
from company.questions import Question
from company.state import QuestionState, now_iso
from pipeline import retrieve

EVAL_MODEL = "gemini-2.5-flash"
SCAN_SCORE_THRESHOLD = 0.5
SCAN_TOP_K = 10
MAX_LLM_RETRIES = 3
RETRY_BASE_DELAY = 2.0

EVAL_PROMPT = """Du bist ein Reviewer der prueft ob eine Frage anhand der gegebenen Quellen
beantwortet werden kann.

Frage: {question}

Quellen aus der Wissensbasis:
{chunks}

Bewerte:
- "covered": Frage ist vollstaendig und eindeutig beantwortbar
- "partial": Teile der Frage sind belegt, aber wesentliche Aspekte fehlen
- "missing": Frage kann nicht oder nur sehr vage beantwortet werden

Gib eine kurze Antwort wenn moeglich (1-3 Saetze, faktenbasiert aus den Quellen).
Bei "partial" oder "missing" notiere im Feld "notes" was konkret fehlt.

Antworte AUSSCHLIESSLICH als JSON mit diesem Schema:
{{
  "status": "covered" | "partial" | "missing",
  "answer": string oder null,
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


def _call_gemini_with_retry(client: genai.Client, prompt: str) -> str:
    """Ruft Gemini auf mit exponential backoff bei transienten 5xx Fehlern."""
    last_error = None
    for attempt in range(MAX_LLM_RETRIES):
        try:
            response = client.models.generate_content(
                model=EVAL_MODEL,
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
            return response.text
        except genai_errors.ServerError as err:
            last_error = err
            if attempt < MAX_LLM_RETRIES - 1:
                time.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                continue
            raise

    raise last_error


def _evaluate_chunks(question: Question, chunks: list) -> dict:
    if not chunks:
        return {
            "status": "missing",
            "answer": None,
            "confidence": 0.0,
            "notes": "Keine relevanten Chunks im RAG gefunden.",
        }

    client = genai.Client(api_key=config.GOOGLE_API_KEY)
    prompt = EVAL_PROMPT.format(
        question=question.text,
        chunks=_format_chunks(chunks),
    )

    raw_response = _call_gemini_with_retry(client, prompt)
    parsed = json.loads(raw_response)
    return {
        "status": parsed.get("status", "missing"),
        "answer": parsed.get("answer"),
        "confidence": float(parsed.get("confidence", 0.0)),
        "notes": parsed.get("notes"),
    }


def scan_question(question: Question) -> QuestionState:
    """Retrievet Chunks fuer die Frage und laesst Gemini bewerten ob abdeckbar."""
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
        filters=filters,
        top_k=SCAN_TOP_K,
        score_threshold=SCAN_SCORE_THRESHOLD,
    )

    evaluation = _evaluate_chunks(question, chunks)

    sources = [
        {"source_file": c.meta.get("source_file", "unbekannt"), "score": float(c.score)}
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


def scan_all_questions(
    questions: list[Question],
    existing_state: dict[str, QuestionState],
) -> dict[str, QuestionState]:
    """Scannt alle Fragen sequenziell. User-gegebene Antworten werden NICHT
    ueberschrieben. Wenn eine einzelne Frage scheitert (LLM-Error trotz Retry),
    wird sie als 'missing' mit Fehler-Note markiert und der Scan laeuft weiter."""
    updated: dict[str, QuestionState] = {}

    for q in questions:
        existing = existing_state.get(q.id)
        if existing and existing.user_provided:
            existing.last_scanned = now_iso()
            updated[q.id] = existing
            continue

        try:
            updated[q.id] = scan_question(q)
        except Exception as err:
            updated[q.id] = QuestionState(
                question_id=q.id,
                status="missing",
                answer=None,
                confidence=0.0,
                sources=[],
                user_provided=False,
                last_scanned=now_iso(),
                notes=f"Scan-Fehler: {type(err).__name__}: {err}",
            )

    return updated
