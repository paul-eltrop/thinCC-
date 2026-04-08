# Testet die Indexing-Pipeline mit einer echten PDF.
# Uebergibt den Dateipfad an die Pipeline die Parsing,
# Chunking, Embedding und Speichern uebernimmt.

import sys

import config
from document_store import document_store
from pipeline import index_documents

TEST_PDF = "test.pdf"


def check_api_keys():
    if not config.GOOGLE_API_KEY:
        print("GOOGLE_API_KEY nicht gesetzt.")
        sys.exit(1)


def main():
    check_api_keys()

    print(f"Indexiere {TEST_PDF}...")
    index_documents([TEST_PDF])

    count = document_store.count_documents()
    print(f"Indexierung abgeschlossen. {count} Dokumente im Store.")


if __name__ == "__main__":
    main()
