# Initialisiert den Qdrant Document Store.
# Wird von Indexing- und Query-Pipeline gemeinsam genutzt.
# Konfiguration kommt aus config.py.

from haystack_integrations.document_stores.qdrant import QdrantDocumentStore

import config

document_store = QdrantDocumentStore(
    location=config.QDRANT_LOCATION,
    embedding_dim=config.EMBEDDING_DIM,
    recreate_index=True,
)
