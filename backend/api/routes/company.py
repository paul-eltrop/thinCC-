from typing import Optional
# HTTP-Routen fuer das Company Q&A System: Fragen auflisten, Scan triggern
# (synchron oder als SSE-Stream), Antworten speichern oder loeschen.
# Alle Writes gehen in die Supabase company_question_states Tabelle und
# fuer Antworten zusaetzlich als Chunk in Qdrant.

import json
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import CurrentUser, current_user
from company.questions import Question, get_question, load_questions
from company.rag_sync import delete_qa_from_rag, write_qa_to_rag
from company.scanner import scan_all_questions, scan_question
from company.state import QuestionState, load_state, now_iso, save_state, update_question_state

router = APIRouter(prefix="/company", tags=["company"])


class AnswerBody(BaseModel):
    answer: str


def _question_with_state(question: Question, state: dict[str, QuestionState]) -> dict:
    qs = state.get(question.id, QuestionState(question_id=question.id))
    return {
        "question": asdict(question),
        "state": asdict(qs),
    }


@router.get("/questions")
def list_questions(user: CurrentUser = Depends(current_user)) -> dict:
    questions = load_questions()
    state = load_state(user.company_id)
    return {
        "count": len(questions),
        "questions": [_question_with_state(q, state) for q in questions],
    }


@router.get("/questions/{question_id}")
def get_one_question(
    question_id: str,
    user: CurrentUser = Depends(current_user),
) -> dict:
    question = get_question(question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question '{question_id}' nicht gefunden.")

    state = load_state(user.company_id)
    return _question_with_state(question, state)


@router.post("/scan")
def scan_all(user: CurrentUser = Depends(current_user)) -> dict:
    questions = load_questions()
    if not questions:
        raise HTTPException(status_code=500, detail="Kein Fragenkatalog gefunden.")

    existing = load_state(user.company_id)
    updated = scan_all_questions(questions, existing, user.company_id)
    save_state(updated, user.company_id)

    return {
        "scanned": len(updated),
        "states": {qid: asdict(qs) for qid, qs in updated.items()},
    }


@router.post("/scan/stream")
def scan_all_stream(user: CurrentUser = Depends(current_user)) -> StreamingResponse:
    """SSE-Variante von /company/scan: yieldet pro Frage progress + result events,
    damit das Frontend einen determinate Ladebalken anzeigen kann."""
    questions = load_questions()
    if not questions:
        raise HTTPException(status_code=500, detail="Kein Fragenkatalog gefunden.")

    existing = load_state(user.company_id)
    total = len(questions)

    def event_stream():
        yield _sse("start", {"total": total})

        for index, question in enumerate(questions):
            current = index + 1
            yield _sse(
                "progress",
                {
                    "current": current,
                    "total": total,
                    "question_id": question.id,
                    "question_text": question.text,
                },
            )

            previous = existing.get(question.id)
            try:
                new_state = scan_question(question, user.company_id)
                update_question_state(
                    user.company_id,
                    question.id,
                    status=new_state.status,
                    answer=new_state.answer,
                    confidence=new_state.confidence,
                    sources=new_state.sources,
                    user_provided=bool(previous and previous.user_provided),
                    last_scanned=new_state.last_scanned,
                    notes=new_state.notes,
                )
                yield _sse(
                    "result",
                    {
                        "question_id": question.id,
                        "status": new_state.status,
                        "skipped": False,
                    },
                )
            except Exception as err:
                update_question_state(
                    user.company_id,
                    question.id,
                    status="missing",
                    answer=None,
                    confidence=0.0,
                    sources=[],
                    user_provided=bool(previous and previous.user_provided),
                    last_scanned=now_iso(),
                    notes=f"Scan-Fehler: {type(err).__name__}: {err}",
                )
                yield _sse(
                    "result",
                    {
                        "question_id": question.id,
                        "status": "missing",
                        "error": f"{type(err).__name__}: {err}",
                    },
                )

        yield _sse("done", {"total_scanned": total})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/scan/{question_id}")
def scan_one(
    question_id: str,
    user: CurrentUser = Depends(current_user),
) -> dict:
    question = get_question(question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question '{question_id}' nicht gefunden.")

    state = load_state(user.company_id)
    existing = state.get(question_id)
    if existing and existing.user_provided:
        existing.last_scanned = now_iso()
        new_state = existing
    else:
        new_state = scan_question(question, user.company_id)

    state[question_id] = new_state
    save_state(state, user.company_id)
    return asdict(new_state)


@router.post("/questions/{question_id}/answer")
def save_answer(
    question_id: str,
    body: AnswerBody,
    user: CurrentUser = Depends(current_user),
) -> dict:
    question = get_question(question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question '{question_id}' nicht gefunden.")

    if not body.answer.strip():
        raise HTTPException(status_code=400, detail="Antwort darf nicht leer sein.")

    try:
        write_qa_to_rag(user.company_id, question_id, question.text, body.answer)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"RAG-Sync fehlgeschlagen: {err}")

    new_state = update_question_state(
        user.company_id,
        question_id,
        status="covered",
        answer=body.answer,
        confidence=1.0,
        sources=[{"source_file": "company_qa", "score": 1.0}],
        user_provided=True,
        last_scanned=now_iso(),
        notes=None,
    )
    return asdict(new_state)


@router.delete("/questions/{question_id}/answer")
def delete_answer(
    question_id: str,
    user: CurrentUser = Depends(current_user),
) -> dict:
    question = get_question(question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question '{question_id}' nicht gefunden.")

    try:
        delete_qa_from_rag(user.company_id, question_id)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"RAG-Loeschung fehlgeschlagen: {err}")

    new_state = update_question_state(
        user.company_id,
        question_id,
        status="unscanned",
        answer=None,
        confidence=0.0,
        sources=[],
        user_provided=False,
        notes=None,
    )
    return asdict(new_state)


def _sse(event: Optional[str], data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    if event:
        return f"event: {event}\ndata: {payload}\n\n"
    return f"data: {payload}\n\n"