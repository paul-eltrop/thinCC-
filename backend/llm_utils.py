# Generischer Helper fuer Gemini-Calls mit exponential backoff
# bei transienten 5xx-Fehlern. Wird von scanner, extractor, coverage
# und promotion gleichermassen benutzt.

import time

from google import genai
from google.genai import errors as genai_errors

import config

MAX_LLM_RETRIES = 3
RETRY_BASE_DELAY = 2.0


def gemini_client() -> genai.Client:
    return genai.Client(api_key=config.GOOGLE_API_KEY)


def _call_gemini(model: str, prompt: str, json_mime: bool) -> str:
    """Gemeinsamer Retry-Loop fuer Gemini-Calls. Retried bei 5xx mit exponential backoff."""
    client = gemini_client()
    last_error: Exception | None = None
    request_config = {"response_mime_type": "application/json"} if json_mime else None

    for attempt in range(MAX_LLM_RETRIES):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=request_config,
            )
            return response.text
        except genai_errors.ServerError as err:
            last_error = err
            if attempt < MAX_LLM_RETRIES - 1:
                time.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                continue
            raise

    raise last_error if last_error else RuntimeError("Gemini call failed without exception")


def call_gemini_json(model: str, prompt: str) -> str:
    """Ruft Gemini mit JSON-Mime-Type auf, retried bei 5xx mit exponential backoff."""
    return _call_gemini(model, prompt, json_mime=True)


def call_gemini_text(model: str, prompt: str) -> str:
    """Ruft Gemini mit Plain-Text-Output auf, retried bei 5xx mit exponential backoff."""
    return _call_gemini(model, prompt, json_mime=False)
