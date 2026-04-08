# Streamt Anforderungen aus dem Tender-Text live als NDJSON. Pro fertigem
# JSON-Objekt wird ein Generator-Yield gemacht. Damit zeigt das Frontend in
# Echtzeit eine wachsende Tabelle mit extrahierten Anforderungen.

import json
from typing import Iterator

from llm_utils import gemini_client

EXTRACTOR_MODEL = "gemini-2.5-flash"
MAX_TENDER_CHARS = 60000

EXTRACTION_PROMPT = """Du bist ein erfahrener Bid Manager und liest gerade eine
Ausschreibung. Deine Aufgabe: extrahiere alles was wir wissen muessen um eine
gute Bewerbung zu schreiben.

Erfasse zwei Arten von Eintraegen:
1. KONKRETE ANFORDERUNGEN — pruefbare Fakten die der Bewerber liefern muss
   (Zertifikate, Mitarbeiterzahlen, Referenzen, Methodik-Details, Sprachen,
   Versicherungen, Standorte, Vertragsklauseln, ...).
2. OFFENE FRAGESTELLUNGEN — wichtige Topics ueber die der Bewerber im Angebot
   Stellung beziehen muss, aber die nicht als harte Forderung formuliert sind
   ("Welcher Ansatz fuer Datenmigration?", "Wie sieht die Schulungs-Strategie
   aus?", "Welche Risiken seht ihr und wie addressiert ihr sie?").

Regeln fuer die Extraktion:
- Maximal 25 Eintraege insgesamt. Lieber wenige hochwertige als viele banale.
- Eine Zeile pro Eintrag, kurz und praezise (max. ~140 Zeichen).
- Keine Duplikate. Wenn zwei Stellen dieselbe Anforderung formulieren, nur einmal.
- Bewerte die Wichtigkeit:
  * "critical": KO-Kriterium / Eignungskriterium / explizite Pflichtangabe
  * "high": stark gewichtetes Auswahlkriterium / wichtige Fragestellung mit
    grossem Einfluss auf die Bewertung
  * "medium": Standard-Anforderung oder Fragestellung mittlerer Tragweite
  * "low": Nice-to-have, optional
- "is_critical": true NUR wenn der Tender es explizit als Mindestanforderung,
  KO-Kriterium oder Pflichtangabe formuliert. Sonst false.
- Kategorien:
  * "compliance" — Zertifikate, Recht, Datenschutz, Versicherung, Standort
  * "experience" — Referenzen, Vorprojekte, Branchenerfahrung
  * "team" — Personalstaerke, Qualifikationen, Sprachen, Verfuegbarkeit
  * "technical" — Methodik, Tools, technische Faehigkeiten, Architektur
  * "commercial" — Preis, Konditionen, Vertragsmodell, Zahlungsziele
  * "open_question" — Topics ohne harte Forderung wo der Bewerber Stellung
    beziehen muss
  * "other" — wenn nichts passt
- "related_doc_types" — welche internen Dokumenttypen koennten diese Anforderung
  belegen? Erlaubte Werte: cv, reference_project, methodology, company_profile,
  boilerplate, qa_answer. Leer lassen wenn unklar.

WICHTIG zur Output-Formatierung:
- Antworte AUSSCHLIESSLICH im NDJSON-Format.
- Eine vollstaendige JSON-Zeile pro Eintrag, getrennt durch \\n.
- KEINE umschliessende Liste, KEIN Markdown, KEINE Erklaerung, KEINE Codeblocks.
- Format pro Zeile (alle Felder pflicht):
{{"text":"...","category":"...","importance":"...","is_critical":false,"related_doc_types":[]}}

Ausschreibung:
---
{tender_text}
---"""


def stream_requirements(parsed_text: str) -> Iterator[dict]:
    """Streamt Gemini-Output zeilenweise. Yieldet ein dict pro vollstaendiger
    JSON-Zeile. Fehlerhafte Zeilen werden uebersprungen."""
    truncated = parsed_text[:MAX_TENDER_CHARS]
    prompt = EXTRACTION_PROMPT.format(tender_text=truncated)

    client = gemini_client()
    response_stream = client.models.generate_content_stream(
        model=EXTRACTOR_MODEL,
        contents=prompt,
    )

    buffer = ""
    for chunk in response_stream:
        text = getattr(chunk, "text", None)
        if not text:
            continue
        buffer += text
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            parsed = _try_parse_line(line)
            if parsed is not None:
                yield parsed

    tail = _try_parse_line(buffer)
    if tail is not None:
        yield tail


def _try_parse_line(line: str) -> dict | None:
    cleaned = line.strip().strip("`").strip()
    if not cleaned or not cleaned.startswith("{"):
        return None
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None
