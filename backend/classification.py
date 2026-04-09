# LLM-basierte Klassifikation hochgeladener Dokumente in eine feste Liste
# von Typen. Eine Klassifikation pro Dokument, Ergebnis auf alle Chunks
# propagiert — Voraussetzung fuer verlaessliches gefiltertes Retrieval.

from haystack import component
from haystack.dataclasses import Document

import config
from llm_utils import call_gemini_text

DOC_TYPES = [
    "cv",
    "reference_project",
    "methodology",
    "company_profile",
    "boilerplate",
    "qa_answer",
    "other",
]

CLASSIFICATION_HEAD_CHARS = 3000

CLASSIFICATION_PROMPT = """Klassifiziere das folgende Dokument in GENAU EINE Kategorie:

- cv: Lebenslauf einer Person mit Skills, Berufserfahrung, Ausbildung
- reference_project: Beschreibung eines abgeschlossenen Projekts oder einer Case Study
- methodology: Methodik-Dokument, Vorgehensbeschreibung, Framework, Best Practices
- company_profile: Firmenprofil, "Ueber uns", Unternehmensbeschreibung, Capabilities
- boilerplate: Standard-Disclaimer, Compliance-Texte, AGB, Zertifikate, juristische Texte
- other: passt in keine der obigen Kategorien

Antworte AUSSCHLIESSLICH mit dem Kategorie-String (cv, reference_project, methodology,
company_profile, boilerplate oder other). Keine Erklaerung, kein Markdown.

Dokument:
---
{text}
---

Kategorie:"""


def classify_document(text: str) -> str:
    """Schickt einen Text-Auszug an Gemini und gibt einen der DOC_TYPES zurueck.
    Faellt bei Gemini-Fehlern auf 'other' zurueck statt die Indexing-Pipeline
    zu killen — ein 'other'-Label ist weniger schlimm als ein verlorener Upload."""
    if not config.GOOGLE_API_KEY:
        return "other"

    prompt = CLASSIFICATION_PROMPT.format(text=text[:CLASSIFICATION_HEAD_CHARS])

    try:
        raw = call_gemini_text(config.CLASSIFICATION_MODEL, prompt)
    except Exception as err:
        print(f"[classification] Gemini call failed, falling back to 'other': {err}")
        return "other"

    label = raw.strip().lower().replace("`", "").replace("*", "")
    if label not in DOC_TYPES:
        return "other"
    return label


@component
class DocumentClassifier:
    """Haystack-Component die pro Pipeline-Run genau EINE Klassifikation macht
    und das Ergebnis auf alle Chunks propagiert. Da `index_documents()` pro
    Datei einen eigenen pipeline.run() ausfuehrt, entspricht ein Run hier
    immer genau einem Dokument."""

    @component.output_types(documents=list[Document])
    def run(self, documents: list[Document]) -> dict:
        if not documents:
            return {"documents": documents}

        head_text = " ".join(d.content for d in documents)[:CLASSIFICATION_HEAD_CHARS]
        doc_type = classify_document(head_text)

        for doc in documents:
            doc.meta["doc_type"] = doc_type
        return {"documents": documents}
