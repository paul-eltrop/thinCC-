# Cross-Encoder Reranking via Cohere Rerank v2 API. Bekommt eine Query plus
# eine Liste von Haystack-Documents, sortiert sie nach echter Relevanz neu
# und gibt die Top-N zurueck. Faellt auf No-Op zurueck, wenn kein API-Key.

import httpx
from haystack.dataclasses import Document

import config

COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank"
RERANK_TIMEOUT_SECONDS = 15


def rerank(query: str, documents: list[Document], top_n: int) -> list[Document]:
    """Sortiert Documents per Cohere Rerank um und gibt die Top-N zurueck.
    Ohne COHERE_API_KEY oder bei API-Fehler werden die ersten Top-N der
    Eingabe unveraendert zurueckgegeben — Reranking ist eine Verbesserung,
    kein Zwang."""
    if not documents:
        return documents
    if not config.COHERE_API_KEY:
        return documents[:top_n]

    payload = {
        "model": config.RERANK_MODEL,
        "query": query,
        "documents": [d.content for d in documents],
        "top_n": min(top_n, len(documents)),
    }
    headers = {
        "Authorization": f"Bearer {config.COHERE_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(
            COHERE_RERANK_URL,
            json=payload,
            headers=headers,
            timeout=RERANK_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        results = response.json().get("results", [])
    except Exception as err:
        print(f"[reranker] Cohere call failed, falling back to embedding order: {err}")
        return documents[:top_n]

    reranked: list[Document] = []
    for item in results:
        idx = item.get("index")
        if idx is None or idx >= len(documents):
            continue
        doc = documents[idx]
        doc.meta["rerank_score"] = float(item.get("relevance_score", 0.0))
        reranked.append(doc)

    return reranked or documents[:top_n]
