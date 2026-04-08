# Zentrale Konfiguration fuer den Tender Agent.
# Laedt API Keys aus Umgebungsvariablen und definiert
# alle Parameter fuer Embedding, LLM und Vector Store.

import os

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 3072
LLM_MODEL = "gpt-4o"

QDRANT_LOCATION = os.environ.get("QDRANT_LOCATION", ":memory:")

TOP_K = 10

CHUNKER_MAX_TOKENS = 512
