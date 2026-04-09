from typing import Optional
# Generiert Proposal-Drafts und beantwortet Improvement-Chats via Haystack
# OpenAIChatGenerator. Beide Funktionen sind tenant-aware: retrieve() bekommt
# IMMER company_id und scoped damit den RAG-Pull strikt auf die eigene Company.

import json
import re

from haystack.components.builders import ChatPromptBuilder
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage

import config
from pipeline import retrieve

GENERATE_SYSTEM_PROMPT = """Du bist ein erfahrener Bid Manager und Proposal Writer. Erstelle einen strukturierten Proposal-Draft basierend auf der Ausschreibung und den Informationen aus unserer Wissensbasis.

Hier sind die relevanten Abschnitte aus unserer Wissensbasis:
{% for doc in documents %}
---
Quelle: {{ doc.meta.source_file }} | Typ: {{ doc.meta.doc_type }} | Score: {{ doc.score }}
{{ doc.content }}
---
{% endfor %}

Erstelle den Proposal-Draft im JSON-Format. Orientiere dich am Stil einer professionellen EU-Institutional-Proposal mit folgendem Aufbau:

{
  "title": "Aussagekraeftiger Proposal-Titel basierend auf der Ausschreibung",
  "contracting_authority": "Name der ausschreibenden Behoerde/Organisation",
  "sections": [
    {
      "id": "executive-summary",
      "title": "Executive Summary",
      "content": "Zusammenfassung des Angebots in 2-3 Absaetzen. Wer sind wir, was bieten wir, was ist das Ergebnis."
    },
    {
      "id": "problem-framing",
      "title": "Problem Framing",
      "content": "Analyse des Problems / der Aufgabenstellung. Warum ist das relevant, was ist die Herausforderung."
    },
    {
      "id": "approach",
      "title": "Proposed Approach",
      "content": "Beschreibung des Loesungsansatzes. Kann Markdown-Tabellen enthalten fuer Typologien oder Kategorisierungen.\\n\\n| Kategorie | Relevanz | Ansatz |\\n|---|---|---|\\n| ... | ... | ... |"
    },
    {
      "id": "methodology",
      "title": "Methodology",
      "content": "Detaillierte Methodik mit Unter-Abschnitten.\\n\\n### 3.1 Phase 1\\nBeschreibung...\\n\\n### 3.2 Phase 2\\nBeschreibung...\\n\\nVerwende Aufzaehlungen mit Bullet-Points:\\n- Punkt 1\\n- Punkt 2"
    },
    {
      "id": "deliverables",
      "title": "Deliverables",
      "content": "Tabelle der Lieferergebnisse:\\n\\n| Deliverable | Description | Month |\\n|---|---|---|\\n| D1 | ... | M1-M2 |\\n| D2 | ... | M6 |"
    },
    {
      "id": "team",
      "title": "Team",
      "content": "Tabelle der Teammitglieder:\\n\\n| Name | Role | Days |\\n|---|---|---|\\n| [PLACEHOLDER: Name] | Project Lead | [PLACEHOLDER] |"
    },
    {
      "id": "pricing",
      "title": "Price",
      "content": "Preistabelle:\\n\\n| Cost category | EUR |\\n|---|---|\\n| Staff costs | [PLACEHOLDER] |\\n| ... | ... |\\n| TOTAL (excl. VAT) | [PLACEHOLDER] |"
    }
  ]
}

Regeln:
- Schreibe professionell, klar und praezise
- Nutze Markdown-Tabellen (| col1 | col2 |) fuer strukturierte Daten
- Nutze ### fuer Unter-Abschnitte innerhalb einer Section
- Nutze - fuer Aufzaehlungen
- Nutze **text** fuer Hervorhebungen
- Nutze nur Informationen aus dem bereitgestellten Kontext
- Wo Informationen fehlen, markiere mit [PLACEHOLDER: Was hier eingefuegt werden muss]
- Jede Section soll substantiell sein, nicht nur Ueberschriften
- Passe Anzahl und Titel der Sections an die Ausschreibung an — die obige Struktur ist ein Richtwert
- Antworte NUR mit dem JSON-Objekt, kein zusaetzlicher Text"""

CHAT_SYSTEM_PROMPT = """Du bist ein erfahrener Bid Manager und Proposal-Reviewer. Der Nutzer arbeitet an einem Proposal-Draft und braucht Hilfe.

Aktueller Proposal-Draft (als JSON-Sections):
{{ proposal_sections_json }}

Ausschreibung:
{{ tender_text }}

Relevante Informationen aus der Wissensbasis:
{% for doc in documents %}
---
{{ doc.content }}
---
{% endfor %}

Deine Aufgaben:
- Beantworte Fragen zum Proposal
- Gib konkrete Verbesserungsvorschlaege
- Sei konkret und actionable, keine generischen Tipps

WICHTIG — Wenn der Nutzer dich bittet eine Section zu aendern, umzuschreiben, oder zu verbessern:
1. Schreibe zuerst eine kurze Erklaerung was du geaendert hast (1-2 Saetze)
2. Dann liefere die aktualisierten Sections als JSON-Block, eingeschlossen in ```json ... ``` Markdown-Codeblock
3. Das JSON muss ein Array von Section-Objekten sein mit den Feldern: id, title, content
4. Liefere NUR die geaenderten Sections im JSON, nicht alle
5. Behalte die originale Section-ID bei

Beispiel-Antwort wenn eine Section geaendert wird:
Ich habe die Executive Summary ueberarbeitet und den Fokus staerker auf die Kernkompetenzen gelegt.

```json
[{"id": "executive-summary", "title": "Executive Summary", "content": "Neuer verbesserter Inhalt..."}]
```

Wenn der Nutzer nur eine Frage stellt oder Feedback will, antworte normal ohne JSON-Block."""


def generate_proposal_draft(
    tender_text: str,
    company_id: str,
    extra_context: str = "",
) -> dict:
    """Single-Shot Generierung eines Proposal-Drafts. Returnt das raw Response-Text
    aus dem die Frontend-Logik das JSON-Objekt extrahiert."""
    if not tender_text.strip():
        raise ValueError("tender_text darf nicht leer sein.")

    documents = retrieve(
        tender_text,
        company_id=company_id,
        top_k=15,
        score_threshold=0.5,
    )

    prompt_builder = ChatPromptBuilder(
        template=[
            ChatMessage.from_system(GENERATE_SYSTEM_PROMPT),
            ChatMessage.from_user(
                "Ausschreibung:\n{{ tender_text }}\n\n"
                "Zusaetzlicher Kontext:\n{{ extra_context }}"
            ),
        ],
    )
    llm = OpenAIChatGenerator(model=config.LLM_MODEL)

    prompt_result = prompt_builder.run(
        documents=documents,
        tender_text=tender_text,
        extra_context=extra_context,
    )
    llm_result = llm.run(prompt_result["prompt"])

    return {
        "raw_text": llm_result["replies"][0].text,
        "sources_used": len(documents),
    }


def chat_on_proposal(
    message: str,
    tender_text: str,
    sections: list[dict],
    history: list[dict],
    company_id: str,
) -> dict:
    """Chat-Turn fuer Proposal-Improvements. Wenn die LLM-Antwort einen
    ```json [...]``` Block enthaelt, werden die Section-Updates extrahiert
    und der Code-Block aus der angezeigten Antwort entfernt."""
    if not message.strip():
        raise ValueError("message darf nicht leer sein.")

    documents = retrieve(
        message,
        company_id=company_id,
        top_k=8,
        score_threshold=0.5,
    )

    sections_json = json.dumps(sections, ensure_ascii=False)

    messages = [ChatMessage.from_system(CHAT_SYSTEM_PROMPT)]
    for msg in history[-10:]:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            messages.append(ChatMessage.from_user(content))
        elif role == "assistant":
            messages.append(ChatMessage.from_assistant(content))
    messages.append(ChatMessage.from_user("{{ user_message }}"))

    prompt_builder = ChatPromptBuilder(template=messages)
    llm = OpenAIChatGenerator(model=config.LLM_MODEL)

    prompt_result = prompt_builder.run(
        documents=documents,
        tender_text=tender_text,
        proposal_sections_json=sections_json,
        user_message=message,
    )
    llm_result = llm.run(prompt_result["prompt"])

    reply_text = llm_result["replies"][0].text
    updated_sections = _extract_section_updates(reply_text)
    display_text = _strip_json_block(reply_text) if updated_sections else reply_text

    return {
        "reply": display_text,
        "updated_sections": updated_sections,
    }


def _extract_section_updates(text: str) -> Optional[list[dict]]:
    match = re.search(r"```json\s*(\[[\s\S]*?\])\s*```", text)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(1))
    except (ValueError, KeyError):
        return None
    if not isinstance(parsed, list):
        return None
    cleaned = [
        {"id": s["id"], "title": s["title"], "content": s["content"]}
        for s in parsed
        if isinstance(s, dict) and "id" in s and "title" in s and "content" in s
    ]
    return cleaned or None


def _strip_json_block(text: str) -> str:
    return re.sub(r"\s*```json\s*\[[\s\S]*?\]\s*```\s*", "", text).strip()