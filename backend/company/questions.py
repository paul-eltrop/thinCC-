# Definiert das Schema fuer den Company-Q&A-Fragenkatalog und laedt die
# Fragen aus der JSON-Datei. Der Katalog ist statisch (handgepflegt) und
# wird beim Start in Speicher geladen.

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

QUESTIONS_FILE = Path(__file__).resolve().parent.parent / "data" / "company_questions.json"

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


def load_questions() -> list[Question]:
    if not QUESTIONS_FILE.exists():
        return []

    raw = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
    return [
        Question(
            id=item["id"],
            category=item["category"],
            text=item["text"],
            importance=item["importance"],
            related_doc_types=item.get("related_doc_types", []),
            answer_format=item["answer_format"],
        )
        for item in raw
    ]


def get_question(question_id: str) -> Question | None:
    for q in load_questions():
        if q.id == question_id:
            return q
    return None
