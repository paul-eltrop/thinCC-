# Schreibt User-gegebene Q&A-Antworten direkt als handcrafted Documents in
# Qdrant — ohne Docling-Pfad, weil wir nur Text haben. Nutzt eine kleine
# Mini-Pipeline (nur Embedder + Writer) und deterministische Document-IDs.

from haystack import Pipeline
from haystack.components.writers import DocumentWriter
from haystack.dataclasses import Document
from haystack.document_stores.types import DuplicatePolicy
from haystack_integrations.components.embedders.google_genai import GoogleGenAIDocumentEmbedder

import config
from document_store import document_store

QA_DOC_TYPE = "qa_answer"


def qa_chunk_id(company_id: str, question_id: str) -> str:
    return f"qa_{company_id}_{question_id}"


def _build_qa_pipeline() -> Pipeline:
    pipeline = Pipeline()
    pipeline.add_component(
        "embedder",
        GoogleGenAIDocumentEmbedder(model=config.EMBEDDING_MODEL),
    )
    pipeline.add_component(
        "writer",
        DocumentWriter(document_store=document_store, policy=DuplicatePolicy.OVERWRITE),
    )
    pipeline.connect("embedder", "writer")
    return pipeline


def write_qa_to_rag(
    company_id: str,
    question_id: str,
    question_text: str,
    answer: str,
) -> int:
    """Schreibt eine User-Antwort als Document in Qdrant. Wenn die Question-ID
    schon einen Chunk hat, wird er ueberschrieben (deterministische ID + OVERWRITE)."""
    document = Document(
        id=qa_chunk_id(company_id, question_id),
        content=f"Frage: {question_text}\nAntwort: {answer}",
        meta={
            "source_file": "company_qa",
            "doc_type": QA_DOC_TYPE,
            "question_id": question_id,
            "company_id": company_id,
        },
    )

    pipeline = _build_qa_pipeline()
    result = pipeline.run({"embedder": {"documents": [document]}})
    return result.get("writer", {}).get("documents_written", 0)


def delete_qa_from_rag(company_id: str, question_id: str) -> None:
    document_store.delete_documents([qa_chunk_id(company_id, question_id)])
