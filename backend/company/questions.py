# Globaler Frage-Katalog. Liegt in der Supabase Tabelle company_questions
# und wird via service client geladen — gleich fuer alle Companies, sortiert
# nach display_order.

from dataclasses import dataclass
from typing import Literal, Optional

from auth import supabase_service

Importance = Literal["critical", "high", "medium", "low"]
AnswerFormat = Literal["yes_no", "short_text", "long_text", "list", "number"]


@dataclass
class Question:
    id: str
    category: str
    text: str
    importance: Importance
    related_doc_types: list[str]
    answer_format: AnswerFormat


def _row_to_question(row: dict) -> Question:
    return Question(
        id=row["id"],
        category=row["category"],
        text=row["text"],
        importance=row["importance"],
        related_doc_types=row.get("related_doc_types") or [],
        answer_format=row["answer_format"],
    )


def load_questions() -> list[Question]:
    result = (
        supabase_service()
        .table("company_questions")
        .select("*")
        .order("display_order")
        .execute()
    )
    return [_row_to_question(row) for row in (result.data or [])]


def get_question(question_id: str) -> Optional[Question]:
    result = (
        supabase_service()
        .table("company_questions")
        .select("*")
        .eq("id", question_id)
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        return None
    return _row_to_question(result.data)
