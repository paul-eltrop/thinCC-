# SSE-Endpoint fuer den Onboarding-Chat. Nimmt die Message-History +
# current_question_id, persistiert ggf. die letzte User-Antwort und streamt
# dann die naechste Agent-Frage Token-fuer-Token via Server-Sent Events.

import json
from typing import Literal, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from chat.agent import ChatMessage, prepare_turn
from chat.llm import stream_chat

router = APIRouter(prefix="/company/chat", tags=["company"])


class ChatMessageBody(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatTurnBody(BaseModel):
    messages: list[ChatMessageBody]
    current_question_id: Optional[str] = None


def _sse(event: str | None, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    if event:
        return f"event: {event}\ndata: {payload}\n\n"
    return f"data: {payload}\n\n"


@router.post("/turn")
def chat_turn(body: ChatTurnBody) -> StreamingResponse:
    history = [ChatMessage(role=m.role, content=m.content) for m in body.messages]
    next_turn = prepare_turn(history, body.current_question_id)

    def event_stream():
        yield _sse(
            "meta",
            {
                "current_question_id": next_turn.current_question_id,
                "done": next_turn.done,
            },
        )

        if next_turn.done:
            yield _sse(None, {"delta": next_turn.system_prompt})
            yield _sse("end", {})
            return

        try:
            for token in stream_chat(next_turn.system_prompt, history):
                yield _sse(None, {"delta": token})
        except Exception as err:
            yield _sse("error", {"message": f"{type(err).__name__}: {err}"})
            return

        yield _sse("end", {})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
