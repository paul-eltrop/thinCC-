# Streamt Anforderungen aus dem Tender-Text live als NDJSON. Pro fertigem
# JSON-Objekt wird ein Generator-Yield gemacht. Damit zeigt das Frontend in
# Echtzeit eine wachsende Tabelle mit extrahierten Anforderungen.

import json
import time
from typing import Iterator

from google.genai import errors as genai_errors

from llm_utils import MAX_LLM_RETRIES, RETRY_BASE_DELAY, gemini_client

EXTRACTOR_MODEL = "gemini-2.5-flash"
MAX_TENDER_CHARS = 60000

EXTRACTION_PROMPT = """You are an experienced bid manager reading a tender. Your
task: extract everything we need to know to write a strong proposal.

Capture two kinds of entries:
1. CONCRETE REQUIREMENTS — verifiable facts the bidder must provide
   (certificates, headcount, references, methodology details, languages,
   insurance, locations, contract clauses, ...).
2. OPEN QUESTIONS — important topics the bidder must take a position on in
   the proposal, but which are not phrased as hard requirements ("Which
   approach for data migration?", "What does the training strategy look
   like?", "What risks do you see and how do you address them?").

Extraction rules:
- At most 25 entries total. Prefer a few high-value ones over many trivial.
- One line per entry, short and precise (max ~140 characters).
- No duplicates. If two places state the same requirement, capture it once.
- Rate importance:
  * "critical": KO criterion / eligibility criterion / explicit mandatory
  * "high": heavily weighted selection criterion / important question with
    strong impact on the evaluation
  * "medium": standard requirement or medium-impact question
  * "low": nice-to-have, optional
- "is_critical": true ONLY if the tender explicitly phrases it as a minimum
  requirement, KO criterion or mandatory disclosure. Otherwise false.
- Categories:
  * "compliance" — certificates, law, data protection, insurance, location
  * "experience" — references, prior projects, industry experience
  * "team" — headcount, qualifications, languages, availability
  * "technical" — methodology, tools, technical capabilities, architecture
  * "commercial" — price, conditions, contract model, payment terms
  * "open_question" — topics without a hard requirement where the bidder
    must take a position
  * "other" — when nothing else fits
- "related_doc_types" — which internal document types could support this
  requirement? Allowed values: cv, reference_project, methodology,
  company_profile, boilerplate, qa_answer. Leave empty if unclear.

IMPORTANT output formatting:
- Respond ONLY in NDJSON format.
- One complete JSON line per entry, separated by \\n.
- NO surrounding list, NO markdown, NO explanation, NO code blocks.
- Format per line (all fields required):
{{"text":"...","category":"...","importance":"...","is_critical":false,"related_doc_types":[]}}

Tender:
---
{tender_text}
---"""


def stream_requirements(parsed_text: str) -> Iterator[dict]:
    """Streamt Gemini-Output zeilenweise. Yieldet ein dict pro vollstaendiger
    JSON-Zeile. Fehlerhafte Zeilen werden uebersprungen."""
    truncated = parsed_text[:MAX_TENDER_CHARS]
    prompt = EXTRACTION_PROMPT.format(tender_text=truncated)

    client = gemini_client()

    response_stream = None
    last_error: Exception | None = None
    for attempt in range(MAX_LLM_RETRIES):
        try:
            response_stream = client.models.generate_content_stream(
                model=EXTRACTOR_MODEL,
                contents=prompt,
            )
            break
        except genai_errors.ServerError as err:
            last_error = err
            if attempt < MAX_LLM_RETRIES - 1:
                time.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                continue
            raise

    if response_stream is None:
        raise last_error if last_error else RuntimeError("Failed to initialise Gemini stream.")

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
