# HTTP-Routen fuer Tender Fit-Check: Upload + synchroner Run, Liste,
# Detail, Recheck, Loeschen, SSE-Chat zum Luecken-Schliessen, Promotion
# am Chat-Ende.

import json
from dataclasses import asdict
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from chat.agent import ChatMessage as AgentChatMessage
from chat.llm import stream_chat
from pipeline import parse_pdf
from tender.chat_agent import prepare_turn
from tender.coverage import scan_requirements
from tender.extractor import extract_requirements
from tender.promotion import promote_answers
from tender.ranking import compute_ranking
from tender.state import (
    Tender,
    delete_tender,
    list_tenders,
    load_tender,
    make_tender_id,
    now_iso,
    save_tender,
)

router = APIRouter(prefix="/tenders", tags=["tenders"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "tenders_pdfs"


def _serialize_tender(tender: Tender) -> dict:
    return {
        "id": tender.id,
        "filename": tender.filename,
        "uploaded_at": tender.uploaded_at,
        "requirements": [asdict(r) for r in tender.requirements],
        "coverage": {rid: asdict(c) for rid, c in tender.coverage.items()},
        "ranking": asdict(tender.ranking) if tender.ranking else None,
    }


@router.post("/upload")
async def upload_tender(file: UploadFile = File(...)) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Nur PDF-Dateien werden akzeptiert.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    tender_id = make_tender_id(file.filename)
    target_path = UPLOAD_DIR / f"{tender_id}.pdf"

    contents = await file.read()
    target_path.write_bytes(contents)

    try:
        parsed_text = parse_pdf(str(target_path))
    except Exception as err:
        raise HTTPException(status_code=422, detail=f"PDF-Parsing fehlgeschlagen: {err}")

    if not parsed_text.strip():
        raise HTTPException(status_code=422, detail="PDF enthielt keinen extrahierbaren Text.")

    try:
        requirements = extract_requirements(parsed_text)
    except Exception as err:
        raise HTTPException(status_code=422, detail=f"Requirement-Extraktion fehlgeschlagen: {err}")

    if not requirements:
        raise HTTPException(status_code=422, detail="Keine Anforderungen extrahiert.")

    coverage = scan_requirements(requirements)
    ranking = compute_ranking(requirements, coverage)

    tender = Tender(
        id=tender_id,
        filename=file.filename,
        uploaded_at=now_iso(),
        parsed_text=parsed_text,
        requirements=requirements,
        coverage=coverage,
        ranking=ranking,
    )
    save_tender(tender)

    return _serialize_tender(tender)


@router.get("")
def get_tenders() -> dict:
    summaries = list_tenders()
    return {"count": len(summaries), "tenders": summaries}


@router.get("/{tender_id}")
def get_tender(tender_id: str) -> dict:
    tender = load_tender(tender_id)
    if tender is None:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")
    return _serialize_tender(tender)


@router.post("/{tender_id}/recheck")
def recheck_tender(tender_id: str) -> dict:
    tender = load_tender(tender_id)
    if tender is None:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")

    tender.coverage = scan_requirements(tender.requirements, existing=tender.coverage)
    tender.ranking = compute_ranking(tender.requirements, tender.coverage)
    save_tender(tender)
    return _serialize_tender(tender)


@router.delete("/{tender_id}")
def delete_one(tender_id: str) -> dict:
    if not delete_tender(tender_id):
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")

    pdf_path = UPLOAD_DIR / f"{tender_id}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    return {"ok": True, "id": tender_id}


class ChatMessageBody(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class TenderChatTurnBody(BaseModel):
    messages: list[ChatMessageBody]
    current_requirement_id: Optional[str] = None


def _sse(event: str | None, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    if event:
        return f"event: {event}\ndata: {payload}\n\n"
    return f"data: {payload}\n\n"


@router.post("/{tender_id}/chat/turn")
def tender_chat_turn(tender_id: str, body: TenderChatTurnBody) -> StreamingResponse:
    history = [AgentChatMessage(role=m.role, content=m.content) for m in body.messages]
    tender, next_turn = prepare_turn(tender_id, history, body.current_requirement_id)

    if tender is None:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")

    def event_stream():
        yield _sse(
            "meta",
            {
                "current_requirement_id": next_turn.current_requirement_id,
                "done": next_turn.done,
                "current_score": next_turn.ranking.score if next_turn.ranking else None,
            },
        )

        if next_turn.done:
            yield _sse(None, {"delta": next_turn.system_prompt})
            if next_turn.ranking:
                yield _sse("ranking", asdict(next_turn.ranking))
            yield _sse("end", {})
            return

        try:
            for token in stream_chat(next_turn.system_prompt, history):
                yield _sse(None, {"delta": token})
        except Exception as err:
            yield _sse("error", {"message": f"{type(err).__name__}: {err}"})
            return

        if next_turn.ranking:
            yield _sse("ranking", asdict(next_turn.ranking))
        yield _sse("end", {})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{tender_id}/chat/end")
def tender_chat_end(tender_id: str) -> dict:
    tender = load_tender(tender_id)
    if tender is None:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")

    try:
        promoted = promote_answers(tender)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Promotion fehlgeschlagen: {err}")

    return {"promoted": promoted, "count": len(promoted)}
