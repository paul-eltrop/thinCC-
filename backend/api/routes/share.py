# Public Share-Chat-Routen: ein externer Empfaenger eines Share-Links
# kann Dokumente hochladen oder Antworten tippen. Der Bot fuehrt eine
# mentale Checkliste, markiert Vollstaendigkeit mit [COLLECTION_COMPLETE]
# und extrahiert pro Turn konkrete Facts in die Company-RAG.

import tempfile
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from haystack.dataclasses import ChatMessage as HaystackChatMessage
from haystack.components.generators.chat import OpenAIChatGenerator
from pydantic import BaseModel

import config
from auth import supabase_service
from company.rag_sync import write_share_artifact
from pipeline import index_documents, retrieve

router = APIRouter(prefix="/share", tags=["share"])

CHAT_SYSTEM_PROMPT = """You are an assistant helping to collect verifiable documents for a tender submission. An external partner has received this chat link to provide specific materials.

PURPOSE:
We are preparing a tender response and need the partner to upload documents as verifiable sources. The specific request is:

---
{welcome_message}
---

YOUR BEHAVIOR:
- First, ask the user to upload documents (PDFs, etc.) as verifiable sources
- If the user says they dont have a document, respond: "No problem! Then please write down what you know and we'll check if that covers what we need."
- Accept text input as a fallback but always prefer documents when available
- When a document is uploaded, analyze what it covers from the request above and list what is still missing
- When the user provides text instead, evaluate if it has enough detail and depth. If not, ask follow-up questions to get more specific information
- Keep a mental checklist of what has been provided vs what is still needed based on the original request
- When ALL required information from the request above has been sufficiently covered (via documents or detailed text), respond with exactly this marker at the start of your message: [COLLECTION_COMPLETE] followed by a summary of everything collected

COMPLETENESS CHECK:
After each interaction, evaluate whether the uploaded documents sufficiently cover all points from the original request. Only mark as complete when you are confident all key requirements are addressed with uploaded documents.

KNOWLEDGE BASE CONTEXT:
{context}

FORMATTING (CRITICAL - YOU MUST FOLLOW THIS):
- NEVER use ** or ## or any markdown syntax. This is a chat, not a document.
- Write plain text only. No bold, no headers, no bullet points with asterisks.
- Use dashes (-) for lists and line breaks for structure.
- Keep it conversational and clean.

RULES:
- Always respond in the same language the user writes in
- Be professional but friendly
- If the user provides enough information in text, accept it and dont keep asking for a document upload
- Only ask for a document if the information is clearly incomplete
- Stay focused on the original request
- When marking complete, immediately provide a clean structured summary without preamble"""


FACT_EXTRACT_PROMPT = """You are an information extractor. The original request was:

{welcome_message}

Below is a user message from a chat. Extract ONLY concrete facts and data that are relevant to the request above. This is supplementary info only - the primary source should always be uploaded documents. Only extract if the user provides specific, verifiable facts (names, numbers, dates, qualifications, experience details). Do NOT extract vague statements, opinions, greetings, questions, or small talk. If relevant facts exist, output a structured summary prefixed with [SOURCE: chat message - unverified]. If there are NO concrete facts, respond with exactly: NO_RELEVANT_INFO"""


class ShareChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ShareChatRequest(BaseModel):
    share_id: str
    question: str
    history: list[ShareChatMessage] = []


def _resolve_share(share_id: str) -> tuple[str, str]:
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
        return "No relevant documents found."
    return "\n\n".join(
        f"[{doc.meta.get('source_file', 'unknown')}]: {doc.content}"
        for doc in docs
    )


def _strip_markdown(text: str) -> str:
    return text.replace("**", "").replace("##", "").strip()


def _extract_facts(question: str, welcome_message: str) -> str | None:
    llm = OpenAIChatGenerator(model=config.LLM_MODEL)
    messages = [
        HaystackChatMessage.from_system(FACT_EXTRACT_PROMPT.format(welcome_message=welcome_message)),
        HaystackChatMessage.from_user(question),
    ]
    result = llm.run(messages=messages)
    extracted = result["replies"][0].text.strip()
    if extracted == "NO_RELEVANT_INFO" or not extracted:
        return None
    return extracted


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
    raw_reply = result["replies"][0].text

    is_complete = "[COLLECTION_COMPLETE]" in raw_reply
    if is_complete:
        summary = _strip_markdown(raw_reply.replace("[COLLECTION_COMPLETE]", ""))
        try:
            write_share_artifact(
                company_id=company_id,
                artifact_id=f"summary_{req.share_id}_{uuid.uuid4().hex[:8]}",
                content=summary,
                doc_type="collection_summary",
                source_label=f"share_chat_summary_{req.share_id}",
            )
        except Exception:
            pass

    try:
        facts = _extract_facts(req.question, welcome_message)
    except Exception:
        facts = None

    if facts:
        try:
            write_share_artifact(
                company_id=company_id,
                artifact_id=f"facts_{req.share_id}_{uuid.uuid4().hex[:8]}",
                content=facts,
                doc_type="chat_extracted_info",
                source_label=f"share_chat_facts_{req.share_id}",
            )
        except Exception:
            pass

    clean_reply = _strip_markdown(raw_reply.replace("[COLLECTION_COMPLETE]", ""))
    return {"reply": clean_reply, "complete": is_complete}


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
