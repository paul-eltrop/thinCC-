# tendr by thinCC!

A multi-tenant SaaS that helps consultancies and sub-contractors win public tenders. Users upload their company knowledge once, then for every new tender the system parses requirements, scores fit, fills gaps via guided chat, and generates a draft proposal — all grounded in retrieval over the company's own documents.

Live: [chickentendr.club]

test acc (prefilled docs): 

    test.test@gmail.com
    123456

feel free to create your own account


---

## How to use it

A typical user journey, in the order features are encountered.

### 1. Sign up and create a company

`/signup` collects email, password, company name and display name. The signup is handled by a backend endpoint ([backend/api/routes/auth.py](backend/api/routes/auth.py)) that uses the Supabase service-role key to atomically create the auth user, the `companies` row and the `profiles` row in one transaction. After that, the client signs in with the same credentials and lands on the dashboard.

### 2. Build the company knowledge base

**Upload documents** under [/company](web/app/company/page.tsx) → Documents tab. Drop in CVs, reference projects, methodology decks, company profiles, certificates, anything that proves capability. Each upload is stored in the Supabase `company_documents` bucket and triggers an indexing job ([backend/api/routes/documents.py](backend/api/routes/documents.py)) that parses the PDF, classifies it, chunks it, embeds the chunks and writes them to Qdrant Cloud (see *RAG Architecture* below).

**Add team members** under the Team tab. The bot can also auto-extract employees from uploaded CVs via [backend/team/scanner.py](backend/team/scanner.py) — names, roles, seniority — and upserts them into the `team_members` table.

**Run the Knowledge Scan** under the Knowledge tab. It runs through ~20 standard onboarding questions (compliance, references, team size, certifications, financials, etc.) and rates each one as `covered`, `partial`, `missing` or `unscanned` based on what the RAG can find. Progress is streamed via SSE so the user sees coverage build up live ([backend/company/scanner.py](backend/company/scanner.py)).

**Fill gaps via chat** for any question marked `partial` or `missing`. The onboarding chat picks the most important open question, shows what the RAG already knows, and asks the user to fill in the rest. Answers are written back to Qdrant as `qa_answer` chunks so future tenders can use them ([backend/chat/agent.py](backend/chat/agent.py)).

**Or share a link with a partner** for any open question. The Share button generates a public link like `chickentendr.club/share/{id}` ([web/app/share/[id]/page.tsx](web/app/share/[id]/page.tsx)) that an external sub-contractor can open without an account. They can chat and upload documents directly into the company's knowledge base via [backend/api/routes/share.py](backend/api/routes/share.py).

### 3. Add a tender

From the dashboard, drop in the tender PDF and fill in name, client, deadline. The PDF lands in the `company_tenders` storage bucket and a row is inserted into `tenders` with `scan_status='pending'` ([backend/api/routes/tenders.py](backend/api/routes/tenders.py)).

### 4. Run the fit-check

Click into the tender and press **Scan**. Three things happen, all streamed live to the browser via Server-Sent Events:

1. **Requirement extraction.** The PDF text is sent to Gemini 2.5 Flash which streams up to 25 requirements as NDJSON ([backend/tender/extractor_stream.py](backend/tender/extractor_stream.py)). Each requirement is categorised (compliance / experience / team / technical / commercial / open_question), tagged with importance (`critical`/`high`/`medium`/`low`) and an `is_critical` boolean. The frontend displays them in a growing table as they arrive.

2. **Coverage check.** For each requirement, the backend retrieves the top relevant chunks from the company RAG (filtered by `meta.company_id`) and asks Gemini to rate the coverage as `covered`, `partial` or `missing` ([backend/tender/coverage.py](backend/tender/coverage.py)). Coverage is stored in the `tender_coverage` table with confidence and source chunks.

3. **Ranking.** A weighted fit score is computed from the coverage results, with critical gaps flagged separately ([backend/tender/ranking.py](backend/tender/ranking.py)). The result is `Apply / Apply with additional input / Do not apply` plus a percentage and a list of strengths and gaps.

### 5. Close gaps via the Bid Manager chat

The chat sidebar on the tender page picks the next uncovered high-importance requirement and asks the user to fill it in ([backend/tender/chat_agent.py](backend/tender/chat_agent.py)). It also shows the top RAG hints so the user can see what's already on file. Answers are stored as `user_provided` evidence on the requirement, the score is recomputed, and the chat moves on.

For requirements that need external evidence (a partner's certificate, a sub-contractor's CV), the user can also generate a tender-scoped share link from the chat — same flow as the company-level share, but the resulting evidence is attached to the specific requirement.

### 6. Generate the proposal draft

Once the fit-check is good enough, **Generate Proposal** kicks off the draft generator ([backend/tender/proposal_engine.py](backend/tender/proposal_engine.py)). It pulls relevant chunks from the company RAG, runs them through a structured GPT-4o prompt and returns a JSON list of sections (executive summary, problem framing, approach, methodology, deliverables, team, pricing). Sections render as editable cards on the draft tab.

Each section can be improved with a focused chat — the user describes what they want changed, the agent rewrites that section against the RAG and writes it back.

### 7. Export

The draft tab exports to PDF client-side via `html2pdf.js`. No backend round-trip, no formatting drift.

### 8. Re-scan and reset

If the tender PDF changes or new evidence has been collected, the **Re-scan** button on the fit-check view clears the existing requirements + coverage and re-runs the whole pipeline. User-provided answers from the chat are preserved.

---

## RAG architecture

The retrieval layer is the engine of the whole product. Every meaningful action — fit-check, coverage rating, chat response, proposal generation — runs against the same vector store with the same tenant filter. The design is intentionally boring: a few well-chosen pieces wired together carefully.

### Indexing pipeline

When a document is uploaded:

1. **Parse with Docling.** [backend/pipeline.py](backend/pipeline.py) calls `DoclingConverter` with `HybridChunker`. Docling preserves layout, tables and reading order across multi-column PDFs — much better than `pypdf` for the kind of formal documents tenders involve. The HybridChunker splits at semantic boundaries (sentence ends, table ends, section breaks) instead of fixed character counts.

2. **Chunk size.** The chunker uses the `sentence-transformers/all-MiniLM-L6-v2` tokenizer with a max of 512 tokens per chunk ([backend/config.py](backend/config.py)). 512 is the sweet spot: large enough to keep claims with their evidence, small enough that retrieval scores are precise.

3. **Per-document classification.** [backend/classification.py](backend/classification.py) takes the first ~3000 characters of the document, asks Gemini 2.5 Flash to label it (`cv` / `reference_project` / `methodology` / `company_profile` / `boilerplate` / `qa_answer` / `other`) and stamps that label onto every chunk's `meta.doc_type`. Once per document, not once per chunk — 7x cheaper, accuracy is fine because tender documents almost always have one dominant type.

4. **Embed.** Each chunk is embedded with Google's `gemini-embedding-001` (3072 dimensions) via `GoogleGenAIDocumentEmbedder` from `google-genai-haystack`.

5. **Write to Qdrant.** Chunks land in the `tenderagent_kb` collection in Qdrant Cloud ([backend/document_store.py](backend/document_store.py)). Each chunk carries metadata: `company_id`, `document_id`, `doc_type`, `source_file`, optionally `question_id` for QA-answer chunks. Five payload indexes are created so all of these fields are filterable inside Qdrant's HNSW search instead of after the fact.

### Retrieval pipeline

Every query — fit-check, coverage, chat, scan, proposal — goes through the same path in [backend/pipeline.py](backend/pipeline.py):

1. **Embed the query** with `GoogleGenAITextEmbedder` (same model as indexing, so vectors are comparable).

2. **Vector search with tenant filter.** `QdrantEmbeddingRetriever` runs with `top_k = TOP_K * RERANK_CANDIDATE_MULTIPLIER` (default 10 × 3 = 30 candidates) and a hard filter `meta.company_id == current_user.company_id`. The filter is applied **inside** the HNSW search via Qdrant's payload index, not in Python after the fact. This is the only thing that prevents cross-tenant leakage and it's enforced at the lowest possible layer.

3. **Optional doc_type filter.** Some callers narrow further: the team scanner only wants `doc_type=cv`, the coverage check for a "team" requirement biases toward `cv` and `company_profile`, etc. Same mechanism — additional `must` conditions on the Qdrant filter.

4. **Cohere rerank.** The top 30 candidates go to Cohere `rerank-v3.5` ([backend/reranker.py](backend/reranker.py)) which is a cross-encoder: it reads the query and each candidate together, not as separate embeddings, and scores actual relevance. The top 10 reranked results are returned. Without a Cohere key the system falls back to vector-only — works, just less precise.

5. **Score threshold.** Results below a fit-score floor (`MIN_FIT_SCORE = 0.75`) are dropped before they reach the LLM. Empty retrieval is better than misleading retrieval.

6. **LLM call.** The retained chunks are formatted into a prompt and handed to GPT-4o or Gemini depending on the task — GPT-4o for high-stakes reasoning (fit analysis, proposal generation, chat), Gemini Flash for high-volume rating (coverage, classification, scanning).

### Why this design holds up

- **Docling instead of pypdf.** Public tender documents are full of tables, multi-column layouts, footers and stamps. Naive PDF text extraction garbles all of that. Docling keeps the structure, which means the chunks downstream actually represent what the document says.

- **HybridChunker over fixed sizes.** Fixed-size chunkers cut sentences in half. Semantic chunking keeps each chunk self-contained, which makes the embedding more meaningful and the LLM context more readable.

- **Per-document classification.** Cheaper than per-chunk and better than nothing. The `doc_type` label powers the filter in step 3 above, which lets the coverage check for a "compliance" requirement skip CVs entirely instead of competing with them in the ranking.

- **Two-stage retrieval (vector + cross-encoder).** Vector embeddings rank by semantic similarity which conflates "is about the same topic" with "answers the question". A cross-encoder like Cohere rerank-v3.5 was trained specifically on relevance pairs and re-scores the top candidates for actual answer relevance. Two stages because the cross-encoder is too slow to run on the whole collection but fast enough on 30 candidates. This is the standard architecture for production RAG and it makes a measurable difference.

- **Tenant filter at the index, not in Python.** With company_id as a Qdrant payload index, multi-tenancy is enforced inside the HNSW traversal. Without it, every query would fetch 100+ candidates and throw 99 away — wasted compute, slower latency, and a real risk of forgetting the filter somewhere in user code.

- **Streaming requirement extraction.** Tender PDFs are long and the extraction takes 10–15 seconds. Streaming the requirements as NDJSON means the user sees the table fill in within 1–2 seconds instead of staring at a spinner. Same trick for the live coverage scan.

- **Same RAG, every feature.** Fit-check, coverage, chat, scan, proposal — they all hit the same store with the same filter. There's no parallel "knowledge base" anywhere. Every piece of data the user adds, in any flow, becomes immediately available to every other flow.

---

## Tech stack

### Backend

- **Python 3.12** on a `python:3.12-slim` Docker base, with system libraries for Docling's image processing (`libgl1`, `libxcb1`, `libglib2.0-0`, `libxext6`, `libxrender1`, `libgomp1`)
- **FastAPI** as the web framework, **Uvicorn** as the ASGI server (2 workers in production)
- **Haystack 2.x** for RAG pipeline orchestration
- **supabase-py** as the Supabase client (anon-key for JWT validation, service-role for RLS-bypassing internal operations)

### LLM and AI services

- **Gemini 2.5 Flash** via `google-genai-haystack` — primary workhorse for classification, requirement extraction, coverage rating, knowledge scan, employee extraction
- **Gemini Embedding 001** (3072d) for all document and query embeddings
- **GPT-4o** via `OpenAIChatGenerator` — fit analysis, tender chat, proposal generation, share-chat
- **Cohere rerank-v3.5** as the second-stage retriever ([backend/reranker.py](backend/reranker.py))

### Document processing

- **Docling** for PDF parsing (preserves tables, layout, reading order)
- **docling-haystack** as the Haystack adapter
- **HybridChunker** with `sentence-transformers/all-MiniLM-L6-v2` tokenizer, 512 tokens max per chunk

### Vector store

- **Qdrant Cloud** (Frankfurt region) via `qdrant-haystack`
- Collection: `tenderagent_kb`, embedding dim 3072
- Payload indexes: `meta.company_id`, `meta.doc_type`, `meta.document_id`, `meta.source_file`, `meta.question_id`

### Database, auth, storage

- **Supabase Postgres** for all relational data (`companies`, `profiles`, `documents`, `tenders`, `tender_requirements`, `tender_coverage`, `team_members`, `company_questions`, `company_question_states`, `share_links`)
- **Supabase Auth** for JWT-based sessions
- **Supabase Storage** with two buckets: `company_documents` and `company_tenders`, both path-prefixed by `company_id` and protected by Storage RLS
- **Row Level Security** on every table — every read and write filters by `company_id` derived from the JWT, enforced at Postgres level

### Frontend

- **Next.js 16** (App Router with Turbopack) with **React 19**
- **TypeScript 5**
- **TailwindCSS 4** (utility-first; design system documented in [web/CLAUDE.md](web/CLAUDE.md))
- **Geist Sans** as the only display font
- **@supabase/ssr** + **@supabase/supabase-js** for client and middleware auth, cookie-based session storage
- **html2pdf.js** for client-side proposal export

### Infrastructure and deploy

- **Docker Compose** orchestrates three containers: `backend`, `frontend`, `caddy`
- **Caddy 2** as the public reverse proxy with automatic Let's Encrypt TLS — same-origin path routing (`/api/*` → backend, `/*` → frontend)
- **Vultr VPS** in Frankfurt (4 GB / 2 vCPU, Ubuntu 24.04)
- **Persistent volumes**: `caddy_data` (TLS certs), `caddy_config`, `hf_cache` (Docling HuggingFace models, ~1.5 GB, persisted across rebuilds so PDFs don't trigger model re-downloads)
- **Multi-stage Next.js Docker build** with `output: 'standalone'` so the final frontend image has no `node_modules`

### Operations

- `/api/health` returns Qdrant collection status (used as smoke test after every deploy)
- Per-container JSON-file logging with rotation (10 MB × 3 files)
- `start.sh` for local dev (`uvicorn --reload` + `next dev`), full deploy guide in [deploy/README.md](deploy/README.md)
