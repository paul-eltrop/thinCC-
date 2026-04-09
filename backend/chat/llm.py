# Duenner OpenAI Streaming-Wrapper fuer den Chat-Agent.
# Trennt den LLM-Call von der Agent-Logik damit die testbar bleibt.
# Yieldet Token-Deltas als plain strings.

from typing import Iterator

from openai import OpenAI

import config
from chat.agent import ChatMessage

_client_instance: OpenAI | None = None


def _client() -> OpenAI:
    global _client_instance
    if _client_instance is None:
        _client_instance = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client_instance


def stream_chat(system_prompt: str, history: list[ChatMessage]) -> Iterator[str]:
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend({"role": m.role, "content": m.content} for m in history)

    stream = _client().chat.completions.create(
        model=config.LLM_MODEL,
        messages=messages,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
