# HTTP-Routen fuer Tenders. Step 1: Storage-Upload + CRUD. Step 2: Scan-Stream
# der via Gemini Anforderungen extrahiert + Coverage gegen die Company-RAG
# scannt, plus Chat zum Lueckenschluss + Promotion zur Company-Knowledge-Base.

import json
import tempfile
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Literal, Optional, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import CurrentUser, current_user, supabase_service
from chat.agent import ChatMessage as AgentChatMessage
from chat.llm import stream_chat
from pipeline import parse_pdf
from tender.chat_agent import prepare_turn
from tender.coverage import check_requirement
from tender.db import (
    Requirement,
    clear_scan_state,
    insert_requirement,
    load_tender_full,
    make_requirement_id,
    now_iso,
    patch_proposal_sections,
    save_proposal,
    serialize_tender,
    set_parsed_text,
    update_tender_scan_meta,
    upsert_coverage,
)
from tender.extractor_stream import stream_requirements
from tender.promotion import promote_answers
from tender.proposal_engine import chat_on_proposal, generate_proposal_draft
from tender.ranking import compute_ranking

router = APIRouter(prefix="/tenders", tags=["tenders"])

BUCKET_NAME = "company_tenders"
ALLOWED_EXTENSIONS = {".pdf"}
ALLOWED_CATEGORIES = {"compliance", "experience", "team", "technical", "commercial", "open_question", "other"}
ALLOWED_IMPORTANCE = {"critical", "high", "medium", "low"}
ALLOWED_DOC_TYPES = {"cv", "reference_project", "methodology", "company_profile", "boilerplate", "qa_answer"}
MAX_REQUIREMENTS = 25


class CreateTenderBody(BaseModel):
    storage_path: str
    filename: str
    file_size: Optional[int] = None
    name: str
    client: Optional[str] = None
    deadline: Optional[str] = None


def _validate_extension(filename: str) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Format {suffix} nicht unterstuetzt. Nur PDF erlaubt.")


def _validate_storage_path(storage_path: str, company_id: str) -> None:
    if not storage_path or "/" not in storage_path:
        raise HTTPException(status_code=400, detail="Ungueltiger storage_path.")
    if storage_path.split("/", 1)[0] != company_id:
        raise HTTPException(status_code=403, detail="storage_path liegt nicht im eigenen company-Bereich.")


def _slugify(name: str) -> str:
    base = "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")
    while "--" in base:
        base = base.replace("--", "-")
    return base or "tender"


@router.post("")
def create_tender(body: CreateTenderBody, user: CurrentUser = Depends(current_user)) -> dict:
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name darf nicht leer sein.")
    _validate_extension(body.filename)
    _validate_storage_path(body.storage_path, user.company_id)

    tender_id = str(uuid.uuid4())
    row = {
        "id": tender_id,
        "company_id": user.company_id,
        "name": body.name.strip(),
        "client": (body.client or "").strip() or None,
        "deadline": body.deadline or None,
        "slug": _slugify(body.name),
        "filename": body.filename,
        "storage_path": body.storage_path,
        "file_size": body.file_size,
        "status": "uploaded",
        "scan_status": "pending",
        "created_by": user.user_id,
    }
    result = supabase_service().table("tenders").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Insert fehlgeschlagen.")
    return result.data[0]


@router.get("")
def list_tenders(user: CurrentUser = Depends(current_user)) -> dict:
    rows = (
        supabase_service()
        .table("tenders")
        .select("*")
        .eq("company_id", user.company_id)
        .order("uploaded_at", desc=True)
        .execute()
        .data
        or []
    )
    return {"count": len(rows), "tenders": rows}


@router.get("/{tender_id}")
def get_tender(tender_id: str, user: CurrentUser = Depends(current_user)) -> dict:
    tender = load_tender_full(user.company_id, tender_id)
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")

    sb = supabase_service()
    raw = (
        sb.table("tenders")
        .select("*")
        .eq("id", tender_id)
        .eq("company_id", user.company_id)
        .maybe_single()
        .execute()
    )
    base = raw.data if (raw and raw.data) else {}
    serialized = serialize_tender(tender)
    return {**base, **serialized}


@router.delete("/{tender_id}")
def delete_tender(tender_id: str, user: CurrentUser = Depends(current_user)) -> dict:
    sb = supabase_service()
    fetched = (
        sb.table("tenders")
        .select("id, company_id, storage_path")
        .eq("id", tender_id)
        .maybe_single()
        .execute()
    )
    if not fetched or not fetched.data:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")
    if fetched.data["company_id"] != user.company_id:
        raise HTTPException(status_code=403, detail="Tender gehoert einer anderen Company.")

    storage_path = fetched.data.get("storage_path")
    if storage_path:
        try:
            sb.storage.from_(BUCKET_NAME).remove([storage_path])
        except Exception:
            pass

    sb.table("tenders").delete().eq("id", tender_id).execute()
    return {"ok": True, "id": tender_id}


def _sse(event: Optional[str], data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    if event:
        return f"event: {event}\ndata: {payload}\n\n"
    return f"data: {payload}\n\n"


def _normalize_requirement_dict(idx: int, tender_id: str, raw: dict) -> Optional[Requirement]:
    text = (raw.get("text") or "").strip()
    if not text:
        return None

    category = raw.get("category", "other")
    if category not in ALLOWED_CATEGORIES:
        category = "other"

    importance = raw.get("importance", "medium")
    if importance not in ALLOWED_IMPORTANCE:
        importance = "medium"

    is_critical = bool(raw.get("is_critical", False))
    if importance == "critical":
        is_critical = True

    related = raw.get("related_doc_types") or []
    if not isinstance(related, list):
        related = []
    related = [v for v in related if isinstance(v, str) and v in ALLOWED_DOC_TYPES]

    return Requirement(
        id=make_requirement_id(tender_id, idx),
        text=text,
        category=category,
        importance=importance,
        is_critical=is_critical,
        related_doc_types=related,
    )


def _ensure_parsed_text(tender, sb) -> str:
    if tender.parsed_text:
        return tender.parsed_text
    if not tender.filename:
        raise HTTPException(status_code=422, detail="Tender hat keine Datei.")

    storage_path = (
        sb.table("tenders")
        .select("storage_path")
        .eq("id", tender.id)
        .maybe_single()
        .execute()
        .data
        or {}
    ).get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=422, detail="Tender hat keinen storage_path.")

    data = sb.storage.from_(BUCKET_NAME).download(storage_path)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.write(data)
    tmp.close()
    try:
        text = parse_pdf(tmp.name)
    finally:
        Path(tmp.name).unlink(missing_ok=True)

    if not text.strip():
        raise HTTPException(status_code=422, detail="PDF enthielt keinen extrahierbaren Text.")

    set_parsed_text(tender.id, text)
    return text


@router.post("/{tender_id}/scan/stream")
def scan_tender_stream(
    tender_id: str,
    user: CurrentUser = Depends(current_user),
) -> StreamingResponse:
    """Zwei-Phasen-SSE: Phase 1 streamt Requirements live aus Gemini, Phase 2
    scant die Coverage pro Requirement gegen die Company-RAG. Nach jedem
    Coverage-Result wird das Ranking neu berechnet und gestreamt."""
    tender = load_tender_full(user.company_id, tender_id)
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")

    def event_stream():
        sb = supabase_service()
        try:
            yield _sse("start", {})
            yield _sse("phase", {"step": "parse", "message": "Parse Tender-PDF..."})

            try:
                parsed_text = _ensure_parsed_text(tender, sb)
            except HTTPException as err:
                yield _sse("error", {"message": err.detail})
                update_tender_scan_meta(tender.id, scan_status="error")
                return

            clear_scan_state(tender.id)
            update_tender_scan_meta(tender.id, scan_status="extracting", requirement_count=0)

            yield _sse("phase", {"step": "extract", "message": "Extrahiere Anforderungen..."})

            requirements: list[Requirement] = []
            try:
                for raw in stream_requirements(parsed_text):
                    if len(requirements) >= MAX_REQUIREMENTS:
                        break
                    req = _normalize_requirement_dict(len(requirements) + 1, tender.id, raw)
                    if not req:
                        continue
                    insert_requirement(tender.id, req, len(requirements) + 1)
                    requirements.append(req)
                    yield _sse(
                        "requirement",
                        {
                            "requirement": asdict(req),
                            "extracted_count": len(requirements),
                            "max_expected": MAX_REQUIREMENTS,
                        },
                    )
            except Exception as err:
                yield _sse("error", {"message": f"Extraktion fehlgeschlagen: {type(err).__name__}: {err}"})
                update_tender_scan_meta(tender.id, scan_status="error")
                return

            if not requirements:
                yield _sse("error", {"message": "Keine Anforderungen extrahiert."})
                update_tender_scan_meta(tender.id, scan_status="error")
                return

            update_tender_scan_meta(
                tender.id,
                scan_status="scanning",
                requirement_count=len(requirements),
            )
            yield _sse(
                "phase",
                {"step": "scan", "message": f"Scanne Coverage fuer {len(requirements)} Anforderungen..."},
            )

            coverage_map = {}
            total = len(requirements)
            for idx, req in enumerate(requirements, start=1):
                try:
                    cov = check_requirement(req, user.company_id)
                except Exception as err:
                    from tender.db import RequirementCoverage
                    cov = RequirementCoverage(
                        requirement_id=req.id,
                        status="missing",
                        confidence=0.0,
                        evidence=None,
                        sources=[],
                        user_provided=False,
                        notes=f"Scan-Fehler: {type(err).__name__}: {err}",
                    )

                upsert_coverage(cov)
                coverage_map[req.id] = cov

                ranking = compute_ranking(requirements, coverage_map)
                update_tender_scan_meta(
                    tender.id,
                    score=ranking.score,
                    recommendation=ranking.recommendation,
                    has_critical_gap=ranking.has_critical_gap,
                    reasoning=ranking.reasoning,
                )

                yield _sse(
                    "coverage_result",
                    {
                        "coverage": asdict(cov),
                        "current": idx,
                        "total": total,
                    },
                )
                yield _sse("ranking", asdict(ranking))

            update_tender_scan_meta(
                tender.id,
                scan_status="completed",
                scanned_at=now_iso(),
            )
            yield _sse(
                "done",
                {
                    "requirement_count": total,
                    "score": ranking.score,
                    "recommendation": ranking.recommendation,
                },
            )
        except Exception as err:
            update_tender_scan_meta(tender.id, scan_status="error")
            yield _sse("error", {"message": f"{type(err).__name__}: {err}"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class ChatMessageBody(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class TenderChatTurnBody(BaseModel):
    messages: list[ChatMessageBody]
    current_requirement_id: Optional[str] = None


@router.post("/{tender_id}/chat/turn")
def tender_chat_turn(
    tender_id: str,
    body: TenderChatTurnBody,
    user: CurrentUser = Depends(current_user),
) -> StreamingResponse:
    history = [AgentChatMessage(role=m.role, content=m.content) for m in body.messages]
    tender, next_turn = prepare_turn(
        user.company_id,
        tender_id,
        history,
        body.current_requirement_id,
    )
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


@router.post("/{tender_id}/promote")
def promote_tender(
    tender_id: str,
    user: CurrentUser = Depends(current_user),
) -> dict:
    tender = load_tender_full(user.company_id, tender_id)
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")

    try:
        promoted = promote_answers(tender, user.company_id)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Promotion fehlgeschlagen: {err}")

    return {"promoted": promoted, "count": len(promoted)}


class ProposalGenerateBody(BaseModel):
    extra_context: Optional[str] = ""


class ProposalChatBody(BaseModel):
    message: str
    history: list[dict] = []


class ProposalPatchBody(BaseModel):
    sections: list[dict]
    meta: Optional[dict] = None


@router.post("/{tender_id}/proposal/generate")
def generate_proposal(
    tender_id: str,
    body: ProposalGenerateBody,
    user: CurrentUser = Depends(current_user),
) -> dict:
    tender = load_tender_full(user.company_id, tender_id)
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")
    if not tender.parsed_text:
        raise HTTPException(
            status_code=422,
            detail="Tender hat noch keinen geparsten Text. Bitte erst Fit-Check Scan starten.",
        )

    try:
        result = generate_proposal_draft(
            tender_text=tender.parsed_text,
            company_id=user.company_id,
            extra_context=body.extra_context or "",
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Generate fehlgeschlagen: {err}")

    return {"draft": result["raw_text"], "sources_used": result["sources_used"]}


@router.post("/{tender_id}/proposal/chat")
def chat_proposal(
    tender_id: str,
    body: ProposalChatBody,
    user: CurrentUser = Depends(current_user),
) -> dict:
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Nachricht darf nicht leer sein.")

    tender = load_tender_full(user.company_id, tender_id)
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")

    try:
        result = chat_on_proposal(
            message=body.message,
            tender_text=tender.parsed_text or "",
            sections=tender.proposal_sections,
            history=body.history,
            company_id=user.company_id,
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Chat fehlgeschlagen: {err}")

    if result.get("updated_sections"):
        merged = patch_proposal_sections(tender_id, result["updated_sections"])
        result["sections_after_merge"] = merged

    return result


@router.patch("/{tender_id}/proposal")
def patch_proposal(
    tender_id: str,
    body: ProposalPatchBody,
    user: CurrentUser = Depends(current_user),
) -> dict:
    tender = load_tender_full(user.company_id, tender_id)
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' nicht gefunden.")
    save_proposal(tender_id, body.sections, body.meta)
    return {"ok": True, "section_count": len(body.sections)}