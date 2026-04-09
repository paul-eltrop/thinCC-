# LLM-basierte Klassifikation hochgeladener Dokumente in eine feste Liste
# von Typen. Wird beim Upload aufgerufen damit jeder Chunk im RAG mit
# verlaesslichem doc_type landet — Voraussetzung fuer gefilterte Retrieval.

from google import genai
from haystack import component
from haystack.dataclasses import Document

import config

DOC_TYPES = [
    "cv",
    "reference_project",
    "methodology",
    "company_profile",
    "boilerplate",
    "qa_answer",
    "other",
]

CLASSIFICATION_MODEL = "gemini-2.5-flash"

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
    """Schickt die ersten 3000 Zeichen an Gemini und gibt einen der DOC_TYPES zurueck."""
    if not config.GOOGLE_API_KEY:
        return "other"

    client = genai.Client(api_key=config.GOOGLE_API_KEY)
    prompt = CLASSIFICATION_PROMPT.format(text=text[:3000])

    response = client.models.generate_content(
        model=CLASSIFICATION_MODEL,
        contents=prompt,
    )

    label = response.text.strip().lower().replace("`", "").replace("*", "")

    if label not in DOC_TYPES:
        return "other"

    return label


@component
class DocumentClassifier:
    """Haystack-Component die jeden Chunk einzeln klassifiziert. Wird in der
    Indexing-Pipeline zwischen Docling-Converter und Embedder eingesetzt,
    sodass jeder Chunk seinen eigenen doc_type in den Metadaten bekommt."""

    @component.output_types(documents=list[Document])
    def run(self, documents: list[Document]) -> dict:
        for doc in documents:
            doc.meta["doc_type"] = classify_document(doc.content)
        return {"documents": documents}
