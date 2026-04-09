# Zentrale Konfiguration fuer den Tender Agent.
# Laedt API Keys aus Umgebungsvariablen und definiert
# alle Parameter fuer Embedding, LLM und Vector Store.

import os

from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
COHERE_API_KEY = os.environ.get("COHERE_API_KEY", "")

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 3072
LLM_MODEL = "gpt-4o"
CLASSIFICATION_MODEL = "gemini-3.1-flash"
RERANK_MODEL = "rerank-v3.5"

QDRANT_URL = os.environ.get("QDRANT_URL", "")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")

TOP_K = 10
RERANK_CANDIDATE_MULTIPLIER = 3

SCAN_CONCURRENCY = 8

CHUNKER_TOKENIZER = "sentence-transformers/all-MiniLM-L6-v2"
CHUNKER_MAX_TOKENS = 512

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
