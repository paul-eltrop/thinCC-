# HTTP-Routen fuer Unternehmensdokumente. Aktuell nur POST /documents/upload:
# nimmt eine PDF entgegen, speichert sie lokal, indexiert sie ueber die
# Haystack-Pipeline. Die Pipeline klassifiziert dabei jeden Chunk einzeln.

from collections import Counter
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from classification import CLASSIFICATION_MODEL
from pipeline import index_documents

router = APIRouter(prefix="/documents", tags=["documents"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Nur PDF-Dateien werden akzeptiert.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target_path = UPLOAD_DIR / file.filename

    contents = await file.read()
    target_path.write_bytes(contents)

    try:
        result = index_documents([str(target_path)])
    except Exception as err:
        raise HTTPException(status_code=422, detail=f"Indexing fehlgeschlagen: {err}")

    chunks_indexed = result["documents_written"]
    if chunks_indexed == 0:
        raise HTTPException(status_code=422, detail="PDF enthielt keinen extrahierbaren Text.")

    chunks_by_type = Counter(
        doc.meta.get("doc_type", "unknown") for doc in result["classified_documents"]
    )

    return {
        "filename": file.filename,
        "stored_at": str(target_path.relative_to(UPLOAD_DIR.parent.parent)),
        "size_bytes": len(contents),
        "chunks_indexed": chunks_indexed,
        "chunks_by_type": dict(chunks_by_type),
        "classification_model": CLASSIFICATION_MODEL,
    }
