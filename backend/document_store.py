# Initialisiert den Qdrant Document Store fuer den Tender Agent.
# Verbindet sich mit Qdrant Cloud oder faellt auf In-Memory zurueck.
# Stellt sicher dass die noetigen Payload-Indexes existieren (fuer Filter).

from haystack.utils import Secret
from haystack_integrations.document_stores.qdrant import QdrantDocumentStore
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.exceptions import UnexpectedResponse

import config

COLLECTION_NAME = "tenderagent_kb"

PAYLOAD_INDEXES = [
    {"field_name": "meta.doc_type", "field_schema": "text"},
    {"field_name": "meta.source_file", "field_schema": "keyword"},
    {"field_name": "meta.question_id", "field_schema": "keyword"},
    {"field_name": "meta.company_id", "field_schema": "keyword"},
    {"field_name": "meta.document_id", "field_schema": "keyword"},
]

if config.QDRANT_URL and config.QDRANT_API_KEY:
    document_store = QdrantDocumentStore(
        url=config.QDRANT_URL,
        api_key=Secret.from_token(config.QDRANT_API_KEY),
        index=COLLECTION_NAME,
        embedding_dim=config.EMBEDDING_DIM,
        recreate_index=False,
        payload_fields_to_index=PAYLOAD_INDEXES,
    )
else:
    print("WARNUNG: QDRANT_URL/QDRANT_API_KEY nicht gesetzt. Nutze In-Memory Store.")
    document_store = QdrantDocumentStore(
        location=":memory:",
        index=COLLECTION_NAME,
        embedding_dim=config.EMBEDDING_DIM,
        recreate_index=False,
        payload_fields_to_index=PAYLOAD_INDEXES,
    )


def ensure_payload_indexes() -> None:
    """Stellt sicher dass die Payload-Indexes mit dem korrekten Schema existieren.
    Liest die aktuellen Indexes aus der Collection und legt nur fehlende oder
    falsch typisierte neu an (delete + create). Idempotent."""
    if not (config.QDRANT_URL and config.QDRANT_API_KEY):
        return

    client = QdrantClient(url=config.QDRANT_URL, api_key=config.QDRANT_API_KEY)

    try:
        info = client.get_collection(COLLECTION_NAME)
        current_schema = {k: v.data_type for k, v in (info.payload_schema or {}).items()}
    except Exception:
        current_schema = {}

    for idx in PAYLOAD_INDEXES:
        field_name = idx["field_name"]
        desired_type = idx["field_schema"]
        current_type = current_schema.get(field_name)

        if current_type and str(current_type).lower().endswith(desired_type):
            continue

        try:
            if current_type:
                client.delete_payload_index(
                    collection_name=COLLECTION_NAME,
                    field_name=field_name,
                )
            client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name=field_name,
                field_schema=desired_type,
            )
        except UnexpectedResponse:
            pass


def delete_chunks_by_document_id(document_id: str) -> int:
    """Loescht alle Qdrant-Chunks die zu einem document_id gehoeren via Filter-Delete.
    Haystack kann nur per ID loeschen, deshalb umgehen wir hier den DocumentStore
    und reden direkt mit dem qdrant_client. Returnt 0 wenn nicht gegen Cloud."""
    if not (config.QDRANT_URL and config.QDRANT_API_KEY):
        return 0

    client = QdrantClient(url=config.QDRANT_URL, api_key=config.QDRANT_API_KEY)
    selector = qdrant_models.FilterSelector(
        filter=qdrant_models.Filter(
            must=[
                qdrant_models.FieldCondition(
                    key="meta.document_id",
                    match=qdrant_models.MatchValue(value=document_id),
                )
            ]
        )
    )
    client.delete(collection_name=COLLECTION_NAME, points_selector=selector)
    return 1


ensure_payload_indexes()
