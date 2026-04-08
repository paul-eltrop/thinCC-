# End-to-End Smoke-Test fuer Indexing, Retrieval und Fit Check.
# Indexiert eine Test-PDF, retrievet Chunks
# und fuehrt einen Fit Check gegen eine Beispiel-Ausschreibung aus.

import sys
from collections import Counter
from pathlib import Path

import config
from pipeline import index_documents, retrieve, fit_check, parse_pdf

SMOKE_DOC_PATH = Path("test.pdf")


def main() -> int:
    if not config.GOOGLE_API_KEY:
        print("Fehlende Umgebungsvariable: GOOGLE_API_KEY")
        return 1

    if not SMOKE_DOC_PATH.exists():
        print(f"Datei {SMOKE_DOC_PATH} nicht gefunden.")
        return 1

    print("=== Pipeline Smoke Test ===")
    print(f"Datei: {SMOKE_DOC_PATH}")

    result = index_documents([str(SMOKE_DOC_PATH)])
    classified_docs = result["classified_documents"]
    documents_written = result["documents_written"]

    print(f"Chunks erstellt und klassifiziert: {len(classified_docs)}")
    chunks_by_type = Counter(doc.meta.get("doc_type", "unknown") for doc in classified_docs)
    print(f"Verteilung nach doc_type: {dict(chunks_by_type)}\n")

    for i, doc in enumerate(classified_docs):
        print(f"--- Chunk {i + 1} [{doc.meta.get('doc_type')}] ---")
        print(f"Content: {doc.content[:200]}...")
        print()

    print(f"In Qdrant geschrieben: {documents_written}")

    if not classified_docs or documents_written == 0:
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
    result = fit_check(
        tender_text,
        extra_user_prompt="Beziehe besonders unsere Referenzen im Bereich Hochbau und Projektsteuerung ein.",
    )
    print(result)

    print("\nSmoke-Test erfolgreich.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
