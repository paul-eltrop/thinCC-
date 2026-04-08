# FastAPI Server fuer den Tender Agent.
# Stellt Endpoints fuer Indexing, Retrieval, Fit-Check und Chat bereit.
# Alle Endpoints nutzen company_id fuer Tenant-Isolation.

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.components.writers import DocumentWriter
from haystack.dataclasses import ChatMessage, Document
from haystack_integrations.components.embedders.google_genai import GoogleGenAIDocumentEmbedder
from pydantic import BaseModel
from supabase import create_client

import config
from document_store import document_store
from pipeline import index_documents, retrieve, fit_check, parse_pdf

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)


class QueryRequest(BaseModel):
    company_id: str
    question: str


class FitCheckRequest(BaseModel):
    company_id: str
    tender_text: str
    user_prompt: str = ""


class ChatMessage_Schema(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    share_id: str
    question: str
    history: list[ChatMessage_Schema] = []


def store_in_rag(text: str, company_id: str, source: str):
    doc = Document(
        content=text,
        meta={"source_file": source, "doc_type": "chat_response", "company_id": company_id},
    )
    embedder = GoogleGenAIDocumentEmbedder(model=config.EMBEDDING_MODEL)
    writer = DocumentWriter(document_store=document_store)
    embedded = embedder.run(documents=[doc])
    writer.run(documents=embedded["documents"])


@app.post("/index")
async def index_endpoint(
    company_id: str = Form(...),
    file: UploadFile = File(...),
):
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    result = index_documents([tmp_path], company_id=company_id)
    Path(tmp_path).unlink(missing_ok=True)

    return {"status": "indexed", "file": file.filename}


@app.post("/query")
def query_endpoint(req: QueryRequest):
    docs = retrieve(req.question, company_id=req.company_id)
    return {
        "documents": [
            {
                "content": doc.content,
                "score": doc.score,
                "meta": doc.meta,
            }
            for doc in docs
        ]
    }


@app.post("/fit-check")
def fit_check_endpoint(req: FitCheckRequest):
    result = fit_check(
        tender=req.tender_text,
        company_id=req.company_id,
        user_prompt=req.user_prompt,
    )
    return {"result": result}


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


@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    link = supabase.table("share_links").select("company_id, welcome_message").eq("id", req.share_id).single().execute()

    if not link.data:
        return {"reply": "Share link not found."}

    company_id = link.data["company_id"]
    welcome_message = link.data.get("welcome_message", "")

    docs = retrieve(req.question, company_id=company_id)

    if not docs:
        docs = retrieve(req.question)

    context = "\n\n".join(
        f"[{doc.meta.get('source_file', 'unknown')}]: {doc.content}"
        for doc in docs
    ) if docs else "Keine relevanten Dokumente gefunden."

    system_prompt = CHAT_SYSTEM_PROMPT.format(
        welcome_message=welcome_message,
        context=context,
    )

    messages = [ChatMessage.from_system(system_prompt)]

    for msg in req.history:
        if msg.role == "user":
            messages.append(ChatMessage.from_user(msg.content))
        elif msg.role == "assistant":
            messages.append(ChatMessage.from_assistant(msg.content))

    messages.append(ChatMessage.from_user(req.question))

    llm = OpenAIChatGenerator(model=config.LLM_MODEL)
    result = llm.run(messages=messages)
    reply = result["replies"][0].text

    if "[COLLECTION_COMPLETE]" in reply:
        store_in_rag(reply.replace("[COLLECTION_COMPLETE]", "").strip(), company_id, "collection_summary")

    extract_prompt = [
        ChatMessage.from_system(
            f"You are an information extractor. The original request was:\n\n{welcome_message}\n\n"
            f"Below is a user message from a chat. Extract ONLY concrete facts and data that are relevant to the request above. "
            f"This is supplementary info only - the primary source should always be uploaded documents. "
            f"Only extract if the user provides specific, verifiable facts (names, numbers, dates, qualifications, experience details). "
            f"Do NOT extract vague statements, opinions, greetings, questions, or small talk. "
            f"If relevant facts exist, output a structured summary prefixed with [SOURCE: chat message - unverified]. "
            f"If there are NO concrete facts, respond with exactly: NO_RELEVANT_INFO"
        ),
        ChatMessage.from_user(req.question),
    ]
    extract_result = llm.run(messages=extract_prompt)
    extracted = extract_result["replies"][0].text.strip()

    if extracted != "NO_RELEVANT_INFO":
        store_in_rag(extracted, company_id, "chat_extracted_info")

    clean_reply = reply.replace("[COLLECTION_COMPLETE]", "").replace("**", "").replace("##", "").strip()
    return {"reply": clean_reply}


@app.post("/chat/upload")
async def chat_upload_endpoint(
    share_id: str = Form(...),
    file: UploadFile = File(...),
):
    link = supabase.table("share_links").select("company_id").eq("id", share_id).single().execute()

    if not link.data:
        return {"error": "Share link not found."}

    company_id = link.data["company_id"]
    suffix = Path(file.filename).suffix

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    index_documents([tmp_path], company_id=company_id)
    Path(tmp_path).unlink(missing_ok=True)

    return {"status": "indexed", "file": file.filename}
