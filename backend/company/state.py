# Persistenter State pro Question: Status, Antwort, Confidence, Quellen.
# Wird als JSON-Datei gespeichert (single-instance MVP, kein DB-Layer).
# Schreibvorgaenge sind atomar (temp file + os.replace).

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

STATE_FILE = Path(__file__).resolve().parent.parent / "data" / "company_state.json"

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


def load_state() -> dict[str, QuestionState]:
    if not STATE_FILE.exists():
        return {}

    raw = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {
        qid: QuestionState(
            question_id=item["question_id"],
            status=item.get("status", "unscanned"),
            answer=item.get("answer"),
            confidence=item.get("confidence", 0.0),
            sources=item.get("sources", []),
            user_provided=item.get("user_provided", False),
            last_scanned=item.get("last_scanned"),
            notes=item.get("notes"),
        )
        for qid, item in raw.items()
    }


def save_state(state: dict[str, QuestionState]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    serialized = {qid: asdict(qs) for qid, qs in state.items()}

    temp_path = STATE_FILE.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(serialized, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(temp_path, STATE_FILE)


def update_question_state(question_id: str, **updates) -> QuestionState:
    state = load_state()
    current = state.get(question_id, QuestionState(question_id=question_id))

    for key, value in updates.items():
        setattr(current, key, value)

    state[question_id] = current
    save_state(state)
    return current


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
