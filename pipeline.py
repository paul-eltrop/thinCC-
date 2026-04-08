# Indexing- und Query-Pipelines fuer den Tender Agent.
# Indexing: Docling Parsing/Chunking, Gemini Embedding, Qdrant Store.
# Retrieval: Query embedden, Top-K Chunks aus Qdrant zurueckholen.

from pathlib import Path

from docling.chunking import HybridChunker
from docling_haystack.converter import DoclingConverter
from haystack import Pipeline
from haystack.components.writers import DocumentWriter
from haystack.dataclasses import Document
from haystack_integrations.components.embedders.google_genai import GoogleGenAIDocumentEmbedder, GoogleGenAITextEmbedder
from haystack_integrations.components.retrievers.qdrant import QdrantEmbeddingRetriever

import config
from document_store import document_store

DOC_TYPE_FOLDERS = {"cvs", "company_profile", "methodology", "reference_project"}


def derive_doc_type(file_path: str) -> str:
    parts = Path(file_path).parts
    for part in parts:
        if part in DOC_TYPE_FOLDERS:
            return part
    return "unknown"


def build_indexing_pipeline() -> Pipeline:
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
    pipeline.add_component(
        "embedder",
        GoogleGenAIDocumentEmbedder(model=config.EMBEDDING_MODEL),
    )
    pipeline.add_component(
        "writer",
        DocumentWriter(document_store=document_store),
    )

    pipeline.connect("converter", "embedder")
    pipeline.connect("embedder", "writer")

    return pipeline


def index_documents(paths: list[str]) -> dict:
    pipeline = build_indexing_pipeline()

    for path in paths:
        doc_type = derive_doc_type(path)
        result = pipeline.run(
            {"converter": {"sources": [path], "meta": {"source_file": Path(path).name, "doc_type": doc_type}}}
        )

    return result


def build_query_pipeline() -> Pipeline:
    pipeline = Pipeline()

    pipeline.add_component(
        "text_embedder",
        GoogleGenAITextEmbedder(model=config.EMBEDDING_MODEL),
    )
    pipeline.add_component(
        "retriever",
        QdrantEmbeddingRetriever(document_store=document_store, top_k=config.TOP_K),
    )

    pipeline.connect("text_embedder.embedding", "retriever.query_embedding")

    return pipeline


def retrieve(question: str, filters: dict = None) -> list[Document]:
    pipeline = build_query_pipeline()

    retriever_params = {}
    if filters:
        retriever_params["filters"] = filters

    result = pipeline.run({
        "text_embedder": {"text": question},
        "retriever": retriever_params,
    })

    return result["retriever"]["documents"]
