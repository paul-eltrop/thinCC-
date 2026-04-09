# HTTP-Routen fuer Company-Dokumente. Upload laeuft direkt vom Browser
# in Supabase Storage; diese Route triggert nur das Indexing in den RAG
# und persistiert Metadaten in der Supabase documents-Tabelle. Loeschen
# raeumt Storage, DB-Row und alle zugehoerigen Qdrant-Chunks gleichzeitig auf.

import mimetypes
import tempfile
import traceback
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

import config
from auth import CurrentUser, current_user, supabase_service
from document_store import delete_chunks_by_document_id
from pipeline import index_documents

router = APIRouter(prefix="/documents", tags=["documents"])

BUCKET_NAME = "company_documents"
ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".xlsx", ".pptx",
    ".txt", ".md", ".html", ".htm",
    ".png", ".jpg", ".jpeg",
}


class IndexBody(BaseModel):
    storage_path: str
    filename: str
    file_size: int | None = None


def _validate_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format {suffix} not supported. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )
    return suffix


def _validate_storage_path(storage_path: str, company_id: str) -> None:
    if not storage_path or "/" not in storage_path:
        raise HTTPException(status_code=400, detail="Invalid storage_path.")
    if storage_path.split("/", 1)[0] != company_id:
        raise HTTPException(status_code=403, detail="storage_path is not inside the caller's company area.")


def _download_to_temp(storage_path: str, suffix: str) -> Path:
    storage = supabase_service().storage.from_(BUCKET_NAME)
    try:
        data = storage.download(storage_path)
    except Exception as err:
        raise HTTPException(status_code=404, detail=f"File not in storage: {err}")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(data)
    tmp.close()
    return Path(tmp.name)


def _insert_pending_row(
    document_id: str,
    company_id: str,
    user_id: str,
    storage_path: str,
    filename: str,
    suffix: str,
    file_size: int | None,
) -> dict:
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    row = {
        "id": document_id,
        "company_id": company_id,
        "name": filename,
        "doc_type": "unknown",
        "mime_type": mime,
        "file_path": storage_path,
        "storage_path": storage_path,
        "file_size": file_size,
        "status": "indexing",
        "chunks_indexed": 0,
        "created_by": user_id,
    }
    result = supabase_service().table("documents").insert(row).execute()
    return result.data[0] if result.data else row


def _finalize_ready(document_id: str, chunks_indexed: int, doc_type: str | None) -> None:
    update: dict = {"status": "ready", "chunks_indexed": chunks_indexed, "error_message": None}
    if doc_type:
        update["doc_type"] = doc_type
    supabase_service().table("documents").update(update).eq("id", document_id).execute()


def _mark_failed(document_id: str, error_message: str) -> None:
    update = {
        "status": "failed",
        "chunks_indexed": 0,
        "error_message": error_message[:500],
    }
    supabase_service().table("documents").update(update).eq("id", document_id).execute()


def _dominant_doc_type(classified) -> str:
    if not classified:
        return "unknown"
    counts: dict[str, int] = {}
    for doc in classified:
        t = doc.meta.get("doc_type", "unknown")
        counts[t] = counts.get(t, 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _run_indexing_job(tmp_path: Path, document_id: str, company_id: str) -> None:
    """Background-Task: parsed, klassifiziert, embedded, schreibt nach Qdrant
    und updated die documents-Row auf 'ready' oder 'failed'. Cleanupt das
    Tempfile in jedem Fall."""
    try:
        result = index_documents(
            [str(tmp_path)],
            company_id=company_id,
            document_id=document_id,
        )
        chunks = result["documents_written"]
        if chunks == 0:
            _mark_failed(document_id, "File contained no extractable text.")
            return
        doc_type = _dominant_doc_type(result.get("classified_documents", []))
        _finalize_ready(document_id, chunks_indexed=chunks, doc_type=doc_type)
    except Exception as err:
        traceback.print_exc()
        _mark_failed(document_id, f"{type(err).__name__}: {err}")
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/index", status_code=202)
def index_storage_document(
    body: IndexBody,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(current_user),
) -> dict:
    suffix = _validate_extension(body.filename)
    _validate_storage_path(body.storage_path, user.company_id)

    document_id = str(uuid.uuid4())
    tmp_path = _download_to_temp(body.storage_path, suffix)

    pending = _insert_pending_row(
        document_id=document_id,
        company_id=user.company_id,
        user_id=user.user_id,
        storage_path=body.storage_path,
        filename=body.filename,
        suffix=suffix,
        file_size=body.file_size,
    )

    background_tasks.add_task(_run_indexing_job, tmp_path, document_id, user.company_id)

    return {
        "document": pending,
        "status": "indexing",
        "classification_model": config.CLASSIFICATION_MODEL,
    }


@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    user: CurrentUser = Depends(current_user),
) -> dict:
    sb = supabase_service()
    fetched = (
        sb.table("documents")
        .select("id, company_id, storage_path")
        .eq("id", document_id)
        .single()
        .execute()
    )
    if not fetched.data:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found.")
    if fetched.data["company_id"] != user.company_id:
        raise HTTPException(status_code=403, detail="Document belongs to a different company.")

    storage_path = fetched.data.get("storage_path")

    delete_chunks_by_document_id(document_id)

    if storage_path:
        try:
            sb.storage.from_(BUCKET_NAME).remove([storage_path])
        except Exception:
            pass

    sb.table("documents").delete().eq("id", document_id).execute()

    return {"ok": True, "id": document_id}
