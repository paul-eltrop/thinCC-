# Generischer Helper fuer LLM-Calls mit Retry bei transienten Fehlern.
# Wird von scanner, extractor, coverage und promotion benutzt.
# Nutzt OpenAI gpt-4o als Backend.

import time

from openai import OpenAI

import config

MAX_LLM_RETRIES = 3
RETRY_BASE_DELAY = 2.0

LLM_MODEL = "gpt-4o"

_client: OpenAI | None = None


def openai_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def _call_openai(model: str, prompt: str, json_mode: bool) -> str:
    client = openai_client()
    last_error: Exception | None = None

    for attempt in range(MAX_LLM_RETRIES):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"} if json_mode else None,
                temperature=0.2,
            )
            return response.choices[0].message.content or ""
        except Exception as err:
            last_error = err
            if attempt < MAX_LLM_RETRIES - 1:
                time.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                continue
            raise

    raise last_error if last_error else RuntimeError("LLM call failed without exception")


def call_gemini_json(model: str, prompt: str) -> str:
    return _call_openai(LLM_MODEL, prompt, json_mode=True)


def call_gemini_text(model: str, prompt: str) -> str:
    return _call_openai(LLM_MODEL, prompt, json_mode=False)
