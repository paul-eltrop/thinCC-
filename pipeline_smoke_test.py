# End-to-End Smoke-Test fuer Indexing, Retrieval und Fit Check.
# Indexiert eine Test-PDF, retrievet Chunks
# und fuehrt einen Fit Check gegen eine Beispiel-Ausschreibung aus.

import sys
from pathlib import Path

import config
from pipeline import build_indexing_pipeline, derive_doc_type, retrieve, fit_check, parse_pdf

SMOKE_DOC_PATH = Path("test.pdf")


def main() -> int:
    if not config.GOOGLE_API_KEY:
        print("Fehlende Umgebungsvariable: GOOGLE_API_KEY")
        return 1

    if not SMOKE_DOC_PATH.exists():
        print(f"Datei {SMOKE_DOC_PATH} nicht gefunden.")
        return 1

    pipeline = build_indexing_pipeline()
    output = pipeline.run(
        {
            "converter": {
                "sources": [str(SMOKE_DOC_PATH)],
                "meta": {"source_file": SMOKE_DOC_PATH.name, "doc_type": derive_doc_type(str(SMOKE_DOC_PATH))},
            }
        },
        include_outputs_from={"converter", "embedder", "writer"},
    )

    converted_docs = output.get("converter", {}).get("documents", [])
    embedded_docs = output.get("embedder", {}).get("documents", [])
    documents_written = output.get("writer", {}).get("documents_written", 0)
    embedding_dim = len(embedded_docs[0].embedding) if embedded_docs and embedded_docs[0].embedding else 0

    print("=== Pipeline Smoke Test ===")
    print(f"Datei: {SMOKE_DOC_PATH}")
    print(f"Chunks erstellt: {len(converted_docs)}")

    for i, doc in enumerate(converted_docs):
        print(f"\n--- Chunk {i + 1} ---")
        print(f"Content: {doc.content}")
        print(f"Meta: {doc.meta}")

    print(f"\nChunks mit Embedding: {len(embedded_docs)}")
    print(f"Embedding-Dimension (erstes Chunk): {embedding_dim}")
    print(f"In Qdrant geschrieben: {documents_written}")

    if not converted_docs or not embedded_docs or documents_written == 0:
        print("Indexing fehlgeschlagen: Pipeline lieferte unvollstaendige Ergebnisse.")
        return 1

    print("Indexing erfolgreich.\n")

    if not config.OPENAI_API_KEY:
        print("OPENAI_API_KEY nicht gesetzt, ueberspringe Fit Check.")
        print("Smoke-Test erfolgreich (ohne Fit Check).")
        return 0

    tender_path = "/Users/paul/Downloads/sample_tender1_for_building.pdf"
    print("=== Fit Check Test ===")
    print(f"Tender-PDF: {tender_path}")
    print("Parse Tender mit Docling...")

    tender_text = parse_pdf(tender_path)
    print(f"Tender-Text: {len(tender_text)} Zeichen\n")
    print(f"Vorschau: {tender_text[:300]}...\n")

    print("=== Retrieval: Tender vs. Wissensbasis ===\n")
    results = retrieve(tender_text)

    for i, doc in enumerate(results):
        print(f"--- Treffer {i + 1} (Score: {doc.score:.4f}) ---")
        print(f"Content: {doc.content[:200]}...")
        print(f"Source: {doc.meta.get('source_file', 'unknown')}")
        print()

    print("=== Fit-Analyse (GPT-4o) ===\n")
    result = fit_check(tender_text)
    print(result)

    print("\nSmoke-Test erfolgreich.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
