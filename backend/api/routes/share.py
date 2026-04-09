# Public Share-Chat-Routen: ein externer Empfaenger eines Share-Links
# kann Fragen stellen oder Dokumente hochladen, ohne sich einzuloggen.
# Die share_id ist der Authentifizierungs-Token, company_id wird daraus
# in Supabase aufgeloest.

import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from haystack.dataclasses import ChatMessage as HaystackChatMessage
from haystack.components.generators.chat import OpenAIChatGenerator
from pydantic import BaseModel

import config
from auth import supabase_service
from company.rag_sync import write_qa_to_rag
from pipeline import index_documents, retrieve

router = APIRouter(prefix="/share", tags=["share"])

CHAT_SYSTEM_PROMPT = """Du bist ein intelligenter Assistent in einem Tender-Management-System.
Du hilfst einem externen Nutzer, der diesen Chat-Link erhalten hat.

DEINE AUFGABE:
Der Nutzer hat diesen Link bekommen um bestimmte Informationen bereitzustellen
oder Fragen zu beantworten. Die urspruengliche Anfrage war:

---
{welcome_message}
---

DEIN VERHALTEN:
- Halte die Konversation immer im Kontext der urspruenglichen Anfrage oben
- Wenn der Nutzer Dokumente hochlaedt, bestaetige was du daraus gelernt hast
  und wie es zur Anfrage passt
- Wenn der Nutzer Fragen stellt, beantworte sie basierend auf der Wissensbasis
- Wenn Informationen fehlen die fuer die Anfrage relevant waeren, weise hoeflich darauf hin
- Fasse am Ende einer Konversation zusammen welche Informationen gesammelt wurden
  und was noch fehlt

WISSENSBASIS-KONTEXT:
{context}

REGELN:
- Antworte professionell und strukturiert
- Nutze den Wissensbasis-Kontext wenn relevant
- Bleibe immer im Thema der urspruenglichen Anfrage
- Wenn du etwas nicht weisst, sage es ehrlich"""


class ShareChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ShareChatRequest(BaseModel):
    share_id: str
    question: str
    history: list[ShareChatMessage] = []


def _resolve_share(share_id: str) -> tuple[str, str]:
    """Returnt (company_id, welcome_message) fuer einen Share-Link.
    Raised HTTPException 404 wenn der Link nicht existiert."""
    result = (
        supabase_service()
        .table("share_links")
        .select("company_id, welcome_message")
        .eq("id", share_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Share link not found.")
    return result.data["company_id"], result.data.get("welcome_message", "") or ""


def _format_context(docs: list) -> str:
    if not docs:
        return "Keine relevanten Dokumente gefunden."
    return "\n\n".join(
        f"[{doc.meta.get('source_file', 'unknown')}]: {doc.content}"
        for doc in docs
    )


@router.post("/chat")
def share_chat(req: ShareChatRequest) -> dict:
    company_id, welcome_message = _resolve_share(req.share_id)

    docs = retrieve(req.question, company_id=company_id)
    context = _format_context(docs)
    system_prompt = CHAT_SYSTEM_PROMPT.format(
        welcome_message=welcome_message,
        context=context,
    )

    messages: list[HaystackChatMessage] = [HaystackChatMessage.from_system(system_prompt)]
    for msg in req.history:
        if msg.role == "user":
            messages.append(HaystackChatMessage.from_user(msg.content))
        else:
            messages.append(HaystackChatMessage.from_assistant(msg.content))
    messages.append(HaystackChatMessage.from_user(req.question))

    llm = OpenAIChatGenerator(model=config.LLM_MODEL)
    result = llm.run(messages=messages)
    reply = result["replies"][0].text

    write_qa_to_rag(
        company_id,
        f"share_{req.share_id}_{abs(hash(req.question)) % 10**12}",
        req.question,
        reply,
    )

    return {"reply": reply}


@router.post("/chat/upload")
async def share_chat_upload(
    share_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    company_id, _ = _resolve_share(share_id)

    suffix = Path(file.filename or "upload").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        index_documents([tmp_path], company_id=company_id)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return {"status": "indexed", "file": file.filename}
