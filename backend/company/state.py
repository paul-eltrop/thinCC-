# Per-Company State zu jeder Frage. Liegt in der Supabase Tabelle
# company_question_states (composite PK company_id + question_id) und
# wird via service client gelesen + per upsert geschrieben.

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Literal, Optional

from auth import supabase_service

Status = Literal["covered", "partial", "missing", "unscanned"]


@dataclass
class QuestionState:
    question_id: str
    status: Status = "unscanned"
    answer: Optional[str] = None
    confidence: float = 0.0
    sources: list[dict] = field(default_factory=list)
    user_provided: bool = False
    last_scanned: Optional[str] = None
    notes: Optional[str] = None


def _row_to_state(row: dict) -> QuestionState:
    return QuestionState(
        question_id=row["question_id"],
        status=row.get("status", "unscanned"),
        answer=row.get("answer"),
        confidence=float(row.get("confidence") or 0.0),
        sources=row.get("sources") or [],
        user_provided=bool(row.get("user_provided")),
        last_scanned=row.get("last_scanned"),
        notes=row.get("notes"),
    )


def _state_to_row(state: QuestionState, company_id: str) -> dict:
    row = asdict(state)
    row["company_id"] = company_id
    row["confidence"] = float(state.confidence)
    return row


def load_state(company_id: str) -> dict[str, QuestionState]:
    result = (
        supabase_service()
        .table("company_question_states")
        .select("*")
        .eq("company_id", company_id)
        .execute()
    )
    rows = result.data or []
    return {row["question_id"]: _row_to_state(row) for row in rows}


def save_state(state: dict[str, QuestionState], company_id: str) -> None:
    if not state:
        return
    rows = [_state_to_row(qs, company_id) for qs in state.values()]
    (
        supabase_service()
        .table("company_question_states")
        .upsert(rows, on_conflict="company_id,question_id")
        .execute()
    )


def update_question_state(company_id: str, question_id: str, **updates) -> QuestionState:
    state = load_state(company_id)
    current = state.get(question_id, QuestionState(question_id=question_id))

    for key, value in updates.items():
        setattr(current, key, value)

    row = _state_to_row(current, company_id)
    (
        supabase_service()
        .table("company_question_states")
        .upsert(row, on_conflict="company_id,question_id")
        .execute()
    )
    return current


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
