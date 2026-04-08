# Pipelines fuer den Tender Agent: Indexing, Retrieval und Fit Check.
# Indexing: Docling Parsing/Chunking, Gemini Embedding, Qdrant Store.
# Fit Check: Chunks retrieven, LLM bewertet Match zur Ausschreibung.

from pathlib import Path

from docling.chunking import HybridChunker
from docling_haystack.converter import DoclingConverter
from haystack import Pipeline
from haystack.components.writers import DocumentWriter
from haystack.dataclasses import Document
from haystack.components.builders import ChatPromptBuilder
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage
from haystack_integrations.components.embedders.google_genai import GoogleGenAIDocumentEmbedder, GoogleGenAITextEmbedder
from haystack_integrations.components.retrievers.qdrant import QdrantEmbeddingRetriever

import config
from classification import DocumentClassifier
from document_store import document_store

DOC_TYPE_FOLDERS = {"cvs", "company_profile", "methodology", "reference_project"}

MIN_FIT_SCORE = 0.75

FIT_CHECK_PROMPT = """Du bist ein erfahrener Bid Manager. Analysiere ob unser Unternehmen zu dieser Ausschreibung passt.

Hier sind die relevanten Abschnitte aus unserer Wissensbasis (nur Treffer mit hoher Relevanz):
{% for doc in documents %}
---
Quelle: {{ doc.meta.source_file }} | Typ: {{ doc.meta.doc_type }} | Score: {{ doc.score }}
{{ doc.content }}
---
{% endfor %}

Ausschreibung:
{{ tender }}

Erstelle eine Fit-Analyse in exakt diesem Format:

**Match-Score:** [Prozentsatz]% Fit
**Staerken:** [Aufzaehlung der Staerken die wir nachweisen koennen, mit Bezug auf konkrete Chunks]
**Luecken:** [Was verlangt wird aber in unserer Wissensbasis nicht nachweisbar ist]
**Empfehlung:** [Bewerben / Nicht bewerben / Bewerben mit Zusatz-Input]

Regeln:
- Bewerte NUR basierend auf dem bereitgestellten Kontext
- Wenn wichtige Anforderungen nicht abgedeckt sind, senke den Score
- Bei Luecken konkret benennen was fehlt
- Empfehlung "Bewerben mit Zusatz-Input" wenn Score zwischen 40-70%"""

FIT_CHECK_USER_PROMPT = """Ausschreibung:
{{ tender }}

Zusaetzliche Informationen vom Nutzer:
{{ extra_user_prompt }}"""


def derive_doc_type(file_path: str) -> str:
    """Leitet den Dokumenttyp aus dem Ordnernamen ab (z.B. docs/cvs/ -> cvs)."""
    parts = Path(file_path).parts
    for part in parts:
        if part in DOC_TYPE_FOLDERS:
            return part
    return "unknown"


def company_filter(company_id: str, extra_filters: dict | None = None) -> dict:
    """Baut einen Qdrant-Filter der auf meta.company_id einschraenkt und optional
    weitere Filter mit AND verknuepft."""
    conditions = [{"field": "meta.company_id", "operator": "==", "value": company_id}]
    if extra_filters:
        conditions.append(extra_filters)
    return {"operator": "AND", "conditions": conditions}


def build_indexing_pipeline() -> Pipeline:
    """Baut die Haystack Pipeline: Docling -> per-Chunk Klassifikation -> Gemini Embedding -> Qdrant."""
    pipeline = Pipeline()

    pipeline.add_component(
        "converter",
        DoclingConverter(
            chunker=HybridChunker(
                tokenizer=config.CHUNKER_TOKENIZER,
                max_tokens=config.CHUNKER_MAX_TOKENS,
            ),
        ),
    )
    pipeline.add_component("classifier", DocumentClassifier())
    pipeline.add_component(
        "embedder",
        GoogleGenAIDocumentEmbedder(model=config.EMBEDDING_MODEL),
    )
    pipeline.add_component(
        "writer",
        DocumentWriter(document_store=document_store),
    )

    pipeline.connect("converter", "classifier")
    pipeline.connect("classifier", "embedder")
    pipeline.connect("embedder", "writer")

    return pipeline


def index_documents(
    paths: list[str],
    company_id: str = "",
    document_id: str = "",
) -> dict:
    """Indexiert Dateien in Qdrant. Jeder Chunk wird einzeln per Gemini Flash
    klassifiziert und bekommt seinen eigenen doc_type in den Metadaten.
    Wenn company_id und/oder document_id gesetzt sind, landen sie ebenfalls
    im Chunk-Meta — das ermoeglicht Filter-Retrieval und sauberes Loeschen.
    Returnt die Anzahl geschriebener Chunks und die klassifizierten Documents."""
    pipeline = build_indexing_pipeline()

    classified_documents: list[Document] = []
    documents_written = 0

    for path in paths:
        meta = {"source_file": Path(path).name}
        if company_id:
            meta["company_id"] = company_id
        if document_id:
            meta["document_id"] = document_id
        result = pipeline.run(
            {"converter": {"sources": [path], "meta": meta}},
            include_outputs_from={"classifier"},
        )
        classified_documents.extend(result.get("classifier", {}).get("documents", []))
        documents_written += result.get("writer", {}).get("documents_written", 0)

    return {
        "documents_written": documents_written,
        "classified_documents": classified_documents,
    }


def build_query_pipeline(
    top_k: int = config.TOP_K,
    score_threshold: float = MIN_FIT_SCORE,
) -> Pipeline:
    """Baut die Retrieval Pipeline: Query embedden -> Top-K Chunks aus Qdrant.
    Top-K und score_threshold koennen ueberschrieben werden — der Scanner nutzt
    z.B. einen niedrigeren Threshold weil er mehr Recall als Precision will."""
    pipeline = Pipeline()

    pipeline.add_component(
        "text_embedder",
        GoogleGenAITextEmbedder(model=config.EMBEDDING_MODEL),
    )
    pipeline.add_component(
        "retriever",
        QdrantEmbeddingRetriever(
            document_store=document_store,
            top_k=top_k,
            score_threshold=score_threshold,
        ),
    )

    pipeline.connect("text_embedder.embedding", "retriever.query_embedding")

    return pipeline


def retrieve(
    question: str,
    company_id: str = "",
    filters: dict | None = None,
    top_k: int | None = None,
    score_threshold: float | None = None,
) -> list[Document]:
    """Embedded die Frage und gibt passende Chunks aus Qdrant zurueck. Optional
    mit Filter nach doc_type, company_id-Tenant-Isolation, ueberschreibbarem
    top_k und score_threshold."""
    pipeline = build_query_pipeline(
        top_k=top_k if top_k is not None else config.TOP_K,
        score_threshold=score_threshold if score_threshold is not None else MIN_FIT_SCORE,
    )

    retriever_params = {}
    if company_id:
        retriever_params["filters"] = company_filter(company_id, filters)
    elif filters:
        retriever_params["filters"] = filters

    result = pipeline.run({
        "text_embedder": {"text": question},
        "retriever": retriever_params,
    })

    return result["retriever"]["documents"]


def build_fit_check_pipeline(system_prompt: str = FIT_CHECK_PROMPT) -> Pipeline:
    """Baut die Fit Check Pipeline: Query embedden -> Retrieval -> Prompt mit Chunks -> GPT-4o Analyse."""
    pipeline = Pipeline()

    pipeline.add_component(
        "text_embedder",
        GoogleGenAITextEmbedder(model=config.EMBEDDING_MODEL),
    )
    pipeline.add_component(
        "retriever",
        QdrantEmbeddingRetriever(
            document_store=document_store,
            top_k=config.TOP_K,
            score_threshold=MIN_FIT_SCORE,
        ),
    )
    pipeline.add_component(
        "prompt_builder",
        ChatPromptBuilder(
            template=[
                ChatMessage.from_system(system_prompt),
                ChatMessage.from_user(FIT_CHECK_USER_PROMPT),
            ],
        ),
    )
    pipeline.add_component(
        "llm",
        OpenAIChatGenerator(model=config.LLM_MODEL),
    )

    pipeline.connect("text_embedder.embedding", "retriever.query_embedding")
    pipeline.connect("retriever.documents", "prompt_builder.documents")
    pipeline.connect("prompt_builder", "llm")

    return pipeline


def parse_pdf(file_path: str) -> str:
    """Parst eine PDF mit Docling und gibt den gesamten Text als String zurueck."""
    converter = DoclingConverter(
        chunker=HybridChunker(
            tokenizer=config.CHUNKER_TOKENIZER,
            max_tokens=config.CHUNKER_MAX_TOKENS,
        ),
    )
    result = converter.run(sources=[file_path])
    return "\n\n".join(doc.content for doc in result["documents"])


def fit_check(
    tender: str,
    company_id: str = "",
    extra_user_prompt: str = "",
    filters: dict | None = None,
    system_prompt: str = FIT_CHECK_PROMPT,
) -> str:
    """Nimmt Tender-Text, retrievet passende Chunks (optional gefiltert nach
    company_id) und laesst GPT-4o eine Fit-Analyse erstellen."""
    pipeline = build_fit_check_pipeline(system_prompt=system_prompt)

    retriever_params = {}
    if company_id:
        retriever_params["filters"] = company_filter(company_id, filters)
    elif filters:
        retriever_params["filters"] = filters

    result = pipeline.run({
        "text_embedder": {"text": tender},
        "retriever": retriever_params,
        "prompt_builder": {"tender": tender, "extra_user_prompt": extra_user_prompt},
    })

    return result["llm"]["replies"][0].text
