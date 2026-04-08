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


@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    link = supabase.table("share_links").select("company_id").eq("id", req.share_id).single().execute()

    if not link.data:
        return {"reply": "Share link not found."}

    company_id = link.data["company_id"]
    docs = retrieve(req.question, company_id=company_id)

    if not docs:
        docs = retrieve(req.question)

    context = "\n\n".join(
        f"[{doc.meta.get('source_file', 'unknown')}]: {doc.content}"
        for doc in docs
    ) if docs else ""

    messages = [
        ChatMessage.from_system(
            f"Du beantwortest Fragen basierend auf der Wissensbasis eines Unternehmens. "
            f"Nutze NUR den folgenden Kontext:\n\n{context}"
        ),
    ]

    for msg in req.history:
        if msg.role == "user":
            messages.append(ChatMessage.from_user(msg.content))
        elif msg.role == "assistant":
            messages.append(ChatMessage.from_assistant(msg.content))

    messages.append(ChatMessage.from_user(req.question))

    llm = OpenAIChatGenerator(model=config.LLM_MODEL)
    result = llm.run(messages=messages)
    reply = result["replies"][0].text

    store_in_rag(reply, company_id, "chat_response")

    return {"reply": reply}


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
