# HTTP-Routen fuer das Company Q&A System: Fragen auflisten, Scan triggern,
# Antworten speichern oder loeschen. Schreiboperationen gehen sowohl in den
# JSON-State (pro company_id) als auch (per RAG-Sync) als Document in Qdrant.

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
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
