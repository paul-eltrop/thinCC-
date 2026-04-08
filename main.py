# Einstiegspunkt fuer den Tender Agent.
# Prueft API Keys, indexiert Dokumente aus docs/
# und fuehrt eine Beispiel-Query aus.

import sys
from pathlib import Path

import config
from indexing_pipeline import index_documents
from query_pipeline import query

DOCS_DIR = Path("docs")
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".md", ".txt"}


def check_api_keys():
    missing = []
    if not config.GOOGLE_API_KEY:
        missing.append("GOOGLE_API_KEY")
    if not config.OPENAI_API_KEY:
        missing.append("OPENAI_API_KEY")

    if missing:
        print(f"Fehlende API Keys: {', '.join(missing)}")
        sys.exit(1)


def collect_documents() -> list[str]:
    if not DOCS_DIR.exists():
        print(f"Ordner '{DOCS_DIR}' nicht gefunden. Erstelle ihn und lege Dokumente ab.")
        return []

    return [
        str(path) for path in DOCS_DIR.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]


def main():
    check_api_keys()

    paths = collect_documents()
    if not paths:
        print("Keine Dokumente zum Indexieren gefunden.")
        return

    print(f"{len(paths)} Dokumente gefunden. Starte Indexierung...")
    index_documents(paths)
    print("Indexierung abgeschlossen.")

    example_question = "Beschreibe die Erfahrung und Qualifikationen unseres Teams fuer dieses Projekt."
    print(f"\nBeispiel-Query: {example_question}\n")

    answer = query(example_question)
    print(answer)


if __name__ == "__main__":
    main()
