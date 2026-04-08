# Initialisiert den Qdrant Document Store.
# Verbindet sich mit Qdrant Cloud oder faellt auf In-Memory zurueck.
# Wird von Indexing- und Query-Pipeline gemeinsam genutzt.

from haystack_integrations.document_stores.qdrant import QdrantDocumentStore

import config

if config.QDRANT_URL and config.QDRANT_API_KEY:
    document_store = QdrantDocumentStore(
        url=config.QDRANT_URL,
        api_key=config.QDRANT_API_KEY,
        embedding_dim=config.EMBEDDING_DIM,
        recreate_index=True,
    )
else:
    print("WARNUNG: QDRANT_URL/QDRANT_API_KEY nicht gesetzt. Nutze In-Memory Store.")
    document_store = QdrantDocumentStore(
        location=":memory:",
        embedding_dim=config.EMBEDDING_DIM,
        recreate_index=True,
    )
