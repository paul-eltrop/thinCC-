# HTTP-Routen fuer das Team-Management: CRUD auf team_members plus ein
# SSE-Endpoint der via Gemini Mitarbeiter aus dem RAG extrahiert und neue
# automatisch anlegt. CV-Dokumente werden via doc_type='cv' verknuepft.

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import CurrentUser, current_user, supabase_service
from team.scanner import extract_employees

router = APIRouter(prefix="/team", tags=["team"])


SENIORITY_VALUES = {"junior", "mid", "senior", "lead"}


class CreateMemberBody(BaseModel):
    name: str
    role: Optional[str] = None
    seniority: Optional[str] = None


class UpdateMemberBody(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    seniority: Optional[str] = None
    cv_document_id: Optional[str] = None


def _validate_seniority(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    if value not in SENIORITY_VALUES:
        raise HTTPException(status_code=400, detail=f"Ungueltige Seniority: {value}")
    return value


def _members_with_cv(company_id: str) -> list[dict]:
    sb = supabase_service()
    members = (
        sb.table("team_members")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )
    cv_ids = {m["cv_document_id"] for m in members if m.get("cv_document_id")}
    cv_map: dict[str, str] = {}
    if cv_ids:
        docs = (
            sb.table("documents")
            .select("id,name")
            .in_("id", list(cv_ids))
            .execute()
            .data
            or []
        )
        cv_map = {d["id"]: d["name"] for d in docs}
    for m in members:
        m["cv_document_name"] = cv_map.get(m.get("cv_document_id"))
    return members


@router.get("")
def list_members(user: CurrentUser = Depends(current_user)) -> dict:
    return {"members": _members_with_cv(user.company_id)}


@router.get("/cv-options")
def list_cv_options(user: CurrentUser = Depends(current_user)) -> dict:
    docs = (
        supabase_service()
        .table("documents")
        .select("id,name")
        .eq("company_id", user.company_id)
        .eq("doc_type", "cv")
        .order("name")
        .execute()
        .data
        or []
    )
    return {"options": docs}


@router.post("")
def create_member(
    body: CreateMemberBody,
    user: CurrentUser = Depends(current_user),
) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name darf nicht leer sein.")

    row = {
        "company_id": user.company_id,
        "name": name,
        "role": (body.role or "").strip() or None,
        "seniority": _validate_seniority(body.seniority),
        "created_by_scan": False,
    }
    inserted = (
        supabase_service()
        .table("team_members")
        .insert(row)
        .execute()
        .data
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Insert fehlgeschlagen.")
    return inserted[0]


@router.patch("/{member_id}")
def update_member(
    member_id: str,
    body: UpdateMemberBody,
    user: CurrentUser = Depends(current_user),
) -> dict:
    updates: dict = {}
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Name darf nicht leer sein.")
        updates["name"] = body.name.strip()
    if body.role is not None:
        updates["role"] = body.role.strip() or None
    if body.seniority is not None:
        updates["seniority"] = _validate_seniority(body.seniority)
    if body.cv_document_id is not None:
        updates["cv_document_id"] = body.cv_document_id or None

    if not updates:
        raise HTTPException(status_code=400, detail="Keine Aenderungen.")

    result = (
        supabase_service()
        .table("team_members")
        .update(updates)
        .eq("id", member_id)
        .eq("company_id", user.company_id)
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    return result[0]


@router.delete("/{member_id}")
def delete_member(
    member_id: str,
    user: CurrentUser = Depends(current_user),
) -> dict:
    result = (
        supabase_service()
        .table("team_members")
        .delete()
        .eq("id", member_id)
        .eq("company_id", user.company_id)
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    return {"deleted": member_id}


def _sse(event: str | None, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    if event:
        return f"event: {event}\ndata: {payload}\n\n"
    return f"data: {payload}\n\n"


def _match_cv_id(source_files: list[str], cv_by_name: dict[str, str]) -> Optional[str]:
    for sf in source_files or []:
        key = (sf or "").strip().lower()
        if key in cv_by_name:
            return cv_by_name[key]
    return None


@router.post("/scan/stream")
def scan_team_stream(user: CurrentUser = Depends(current_user)) -> StreamingResponse:
    """SSE-Scan: extrahiert Mitarbeiter via Gemini und legt neue an. Existierende
    Eintraege werden nie ueberschrieben."""

    def event_stream():
        sb = supabase_service()
        yield _sse("start", {})
        yield _sse("phase", {"step": "collect", "message": "Lade Chunks aus dem RAG..."})

        try:
            extracted = extract_employees(user.company_id)
        except Exception as err:
            yield _sse("error", {"message": f"Extraktion fehlgeschlagen: {type(err).__name__}: {err}"})
            return

        yield _sse(
            "phase",
            {"step": "extract", "message": f"{len(extracted)} Personen erkannt"},
        )

        existing_rows = (
            sb.table("team_members")
            .select("name")
            .eq("company_id", user.company_id)
            .execute()
            .data
            or []
        )
        existing_names = {(r.get("name") or "").strip().lower() for r in existing_rows}

        cv_docs = (
            sb.table("documents")
            .select("id,name")
            .eq("company_id", user.company_id)
            .eq("doc_type", "cv")
            .execute()
            .data
            or []
        )
        cv_by_name = {(d["name"] or "").strip().lower(): d["id"] for d in cv_docs}

        yield _sse("phase", {"step": "merge", "message": "Verknuepfe CVs..."})

        added = 0
        skipped = 0
        for emp in extracted:
            name = (emp.get("name") or "").strip()
            if not name:
                continue
            if name.lower() in existing_names:
                skipped += 1
                continue

            seniority = emp.get("seniority")
            if seniority not in SENIORITY_VALUES:
                seniority = None

            row = {
                "company_id": user.company_id,
                "name": name,
                "role": (emp.get("role") or None),
                "seniority": seniority,
                "cv_document_id": _match_cv_id(emp.get("source_files") or [], cv_by_name),
                "created_by_scan": True,
                "last_scanned": datetime.now(timezone.utc).isoformat(),
            }
            try:
                inserted = sb.table("team_members").insert(row).execute().data
            except Exception as err:
                yield _sse(
                    "error",
                    {"message": f"Insert fehlgeschlagen fuer {name}: {err}"},
                )
                continue

            if inserted:
                member = inserted[0]
                member["cv_document_name"] = next(
                    (d["name"] for d in cv_docs if d["id"] == member.get("cv_document_id")),
                    None,
                )
                existing_names.add(name.lower())
                added += 1
                yield _sse("result", {"member": member})

        yield _sse("done", {"added": added, "skipped_existing": skipped})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
