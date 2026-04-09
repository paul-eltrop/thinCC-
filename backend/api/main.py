# FastAPI Skeleton fuer den TenderAgent. CORS-Origins werden ueber die
# Env-Variable CORS_ORIGINS (komma-separiert) gesteuert; Default ist der
# Next.js Dev-Server damit lokales Setup ohne Aenderung weiterlaeuft.

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auth, chat, company, documents, share, team, tenders
from document_store import COLLECTION_NAME, document_store

app = FastAPI(title="TenderAgent API", version="0.1.0")

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(company.router)
app.include_router(team.router)
app.include_router(chat.router)
app.include_router(tenders.router)
app.include_router(share.router)

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {
        "service": "TenderAgent API",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict:
    try:
        count = document_store.count_documents()
    except Exception as err:
        return {
            "status": "degraded",
            "qdrant": {"error": str(err)},
        }

    return {
        "status": "ok",
        "qdrant": {"collection": COLLECTION_NAME, "count": count},
    }
