# FastAPI Skeleton fuer den TenderAgent. Stellt aktuell nur Health- und
# Root-Endpunkt bereit; Upload-, Chat-, Tender- und Voice-Routen folgen
# in den naechsten Schritten. CORS ist auf den Next.js Dev-Server gepinnt.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import chat, company, documents, tenders
from document_store import COLLECTION_NAME, document_store

app = FastAPI(title="TenderAgent API", version="0.1.0")

app.include_router(documents.router)
app.include_router(company.router)
app.include_router(chat.router)
app.include_router(tenders.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
