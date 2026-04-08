# Fuehrt einen einfachen End-to-End Smoke-Test der Indexing-Pipeline aus.
# Erzeugt ein kleines Testdokument und laesst Docling, Chunking und Embedding laufen.
# Gibt eine kompakte Zusammenfassung der Pipeline-Ausgabe fuer CI/Pipeline-Checks aus.

import sys
from pathlib import Path

import config
from indexing_pipeline import build_indexing_pipeline, derive_doc_type

SMOKE_DOC_PATH = Path("docs/smoke_test.md")
SMOKE_CONTENT = """# Smoke Test Dokument

Dieses Dokument prueft die Indexing Pipeline.
Es enthaelt mehrere Saetze, damit Chunking sichtbar wird.
Die Embeddings werden mit dem konfigurierten Modell erstellt.
"""


def ensure_smoke_doc() -> Path:
    SMOKE_DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    SMOKE_DOC_PATH.write_text(SMOKE_CONTENT, encoding="utf-8")
    return SMOKE_DOC_PATH


def main() -> int:
    if not config.GOOGLE_API_KEY:
        print("Fehlende Umgebungsvariable: GOOGLE_API_KEY")
        return 1

    smoke_doc = ensure_smoke_doc()
    pipeline = build_indexing_pipeline()
    output = pipeline.run(
        {
            "converter": {
                "sources": [str(smoke_doc)],
                "meta": {"source_file": smoke_doc.name, "doc_type": derive_doc_type(str(smoke_doc))},
            }
        },
        include_outputs_from={"converter", "embedder", "writer"},
    )

    converted_docs = output.get("converter", {}).get("documents", [])
    embedded_docs = output.get("embedder", {}).get("documents", [])
    documents_written = output.get("writer", {}).get("documents_written", 0)
    embedding_dim = len(embedded_docs[0].embedding) if embedded_docs and embedded_docs[0].embedding else 0

    print("=== Pipeline Smoke Test ===")
    print(f"Datei: {smoke_doc}")
    print(f"Chunks erstellt: {len(converted_docs)}")
    print(f"Chunks mit Embedding: {len(embedded_docs)}")
    print(f"Embedding-Dimension (erstes Chunk): {embedding_dim}")
    print(f"In Qdrant geschrieben: {documents_written}")

    if not converted_docs or not embedded_docs or documents_written == 0:
        print("Smoke-Test fehlgeschlagen: Pipeline lieferte unvollstaendige Ergebnisse.")
        return 1

    print("Smoke-Test erfolgreich.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
