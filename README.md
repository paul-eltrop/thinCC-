# tendr

> A multi-tenant SaaS that helps consultancies and sub-contractors win public tenders. Upload your company knowledge once, then for every new tender the system parses the requirements, scores fit against your RAG, fills gaps via guided chat, and generates a draft proposal — all grounded in retrieval over the company's own documents.

**🏆 Q-Summit × MLH Hackathon (Mannheim, April 2026).** Built in a five-person team. Won the **Istari AI Challenge** and the **Vultr Challenge**, placed **2nd in the pitch battle** in front of 500+ attendees with a jury including Google, Zauber and multiple VCs.

---

## How a tender flows through tendr

A typical run, in the order features are encountered.

### 1. Sign up and create a company

`/signup` collects email, password, company name and display name. The signup is handled by a backend endpoint ([`backend/api/routes/auth.py`](backend/api/routes/auth.py)) that uses the Supabase service-role key to atomically create the auth user, the `companies` row and the `profiles` row in one transaction. After that, the client signs in and lands on the dashboard.

### 2. Build the company knowledge base

**Upload documents** under [`/company` → Documents](web/app/company/page.tsx). Drop in CVs, reference projects, methodology decks, company profiles, certificates — anything that proves capability. Each upload is stored in the `company_documents` Supabase bucket and triggers an indexing job ([`backend/api/routes/documents.py`](backend/api/routes/documents.py)) that parses the PDF, classifies it, chunks it, embeds the chunks and writes them to Qdrant Cloud.

**Add team members** under the Team tab. The bot also auto-extracts employees from uploaded CVs via [`backend/team/scanner.py`](backend/team/scanner.py) — names, roles, seniority — and upserts them into `team_members`.

**Run the Knowledge Scan** under the Knowledge tab. It runs through ~20 standard onboarding questions (compliance, references, team size, certifications, financials, …) and rates each one as `covered` / `partial` / `missing` / `unscanned` based on what the RAG can find. Progress streams over SSE so coverage builds up live ([`backend/company/scanner.py`](backend/company/scanner.py)).

**Fill gaps via chat** for any question marked `partial` or `missing`. The onboarding chat picks the most important open question, shows what the RAG already knows, and asks the user to fill in the rest. Answers are written back to Qdrant as `qa_answer` chunks so future tenders can use them ([`backend/chat/agent.py`](backend/chat/agent.py)).

**Or share a link with a partner** for any open question. The Share button generates a public link like `/share/{id}` ([`web/app/share/[id]/page.tsx`](web/app/share/[id]/page.tsx)) that an external sub-contractor can open without an account. They can chat and upload documents directly into the company's knowledge base via [`backend/api/routes/share.py`](backend/api/routes/share.py).

### 3. Add a tender

From the dashboard, drop in the tender PDF and fill in name, client, deadline. The PDF lands in the `company_tenders` storage bucket and a row is inserted into `tenders` with `scan_status='pending'` ([`backend/api/routes/tenders.py`](backend/api/routes/tenders.py)).

### 4. Run the fit-check

Click into the tender and press **Scan**. Three things happen, all streamed live to the browser via Server-Sent Events:

1. **Requirement extraction.** The PDF text is sent to Gemini 2.5 Flash, which streams up to 25 requirements as NDJSON ([`backend/tender/extractor_stream.py`](backend/tender/extractor_stream.py)). Each is categorised (compliance / experience / team / technical / commercial / open_question), tagged with importance (`critical`/`high`/`medium`/`low`) and an `is_critical` boolean. The frontend displays them in a growing table as they arrive.
2. **Coverage check.** For each requirement, the backend retrieves the top relevant chunks from the company RAG (filtered by `meta.company_id`) and asks Gemini to rate the coverage as `covered` / `partial` / `missing` ([`backend/tender/coverage.py`](backend/tender/coverage.py)). Coverage is stored in `tender_coverage` with confidence and source chunks.
3. **Ranking.** A weighted fit score is computed from the coverage results, with critical gaps flagged separately ([`backend/tender/ranking.py`](backend/tender/ranking.py)). The result is `Apply / Apply with additional input / Do not apply` plus a percentage and a list of strengths and gaps.

### 5. Close gaps via the Bid Manager chat

The chat sidebar on the tender page picks the next uncovered high-importance requirement and asks the user to fill it in ([`backend/tender/chat_agent.py`](backend/tender/chat_agent.py)). It also shows the top RAG hints so the user can see what's already on file. Answers are stored as `user_provided` evidence on the requirement, the score is recomputed, and the chat moves on. For requirements that need external evidence (a partner's certificate, a sub-contractor's CV), the user can also generate a tender-scoped share link from the chat.

### 6. Generate the proposal draft

Once the fit-check is good enough, **Generate Proposal** kicks off the draft generator ([`backend/tender/proposal_engine.py`](backend/tender/proposal_engine.py)). It pulls relevant chunks from the company RAG, runs them through a structured GPT-4o prompt, and returns a JSON list of sections (executive summary, problem framing, approach, methodology, deliverables, team, pricing). Sections render as editable cards on the draft tab. Each section can be improved via a focused chat — the user describes what they want changed, the agent rewrites that section against the RAG and writes it back.

### 7. Export and re-scan

The draft tab exports to PDF client-side via `html2pdf.js` (no backend round-trip, no formatting drift). If the tender PDF changes or new evidence has been collected, the **Re-scan** button clears the existing requirements + coverage and re-runs the whole pipeline. User-provided answers from the chat are preserved.

---

## RAG architecture

The retrieval layer is the engine of the whole product. Every meaningful action — fit-check, coverage rating, chat response, proposal generation — runs against the same vector store with the same tenant filter. The design is intentionally boring: a few well-chosen pieces wired together carefully.

### Indexing pipeline

When a document is uploaded:

1. **Parse with Docling.** [`backend/pipeline.py`](backend/pipeline.py) calls `DoclingConverter` with `HybridChunker`. Docling preserves layout, tables and reading order across multi-column PDFs — much better than `pypdf` for the kind of formal documents tenders involve. The HybridChunker splits at semantic boundaries (sentence ends, table ends, section breaks) instead of fixed character counts.
2. **Chunk size.** The chunker uses `sentence-transformers/all-MiniLM-L6-v2` as tokenizer with a max of 512 tokens per chunk ([`backend/config.py`](backend/config.py)). Large enough to keep claims with their evidence, small enough that retrieval scores are precise.
3. **Per-document classification.** [`backend/classification.py`](backend/classification.py) takes the first ~3000 characters, asks Gemini 2.5 Flash to label it (`cv` / `reference_project` / `methodology` / `company_profile` / `boilerplate` / `qa_answer` / `other`), and stamps the label onto every chunk's `meta.doc_type`. Once per document, not once per chunk — 7× cheaper, accuracy is fine because tender documents almost always have one dominant type.
4. **Embed.** Each chunk is embedded with Google's `gemini-embedding-001` (3072 dim) via `GoogleGenAIDocumentEmbedder`.
5. **Write to Qdrant.** Chunks land in the `tenderagent_kb` collection in Qdrant Cloud ([`backend/document_store.py`](backend/document_store.py)). Each chunk carries metadata: `company_id`, `document_id`, `doc_type`, `source_file`, optionally `question_id`. Five payload indexes are created so all of these fields are filterable inside Qdrant's HNSW search instead of after the fact.

### Retrieval pipeline

Every query — fit-check, coverage, chat, scan, proposal — goes through the same path in [`backend/pipeline.py`](backend/pipeline.py):

1. **Embed the query** with `GoogleGenAITextEmbedder` (same model as indexing, so vectors are comparable).
2. **Vector search with tenant filter.** `QdrantEmbeddingRetriever` runs with `top_k = TOP_K * RERANK_CANDIDATE_MULTIPLIER` (default 10 × 3 = 30 candidates) and a hard filter `meta.company_id == current_user.company_id`. The filter is applied **inside** the HNSW search via Qdrant's payload index, not in Python after the fact. This is the only thing that prevents cross-tenant leakage and it's enforced at the lowest possible layer.
3. **Optional doc_type filter.** Some callers narrow further: the team scanner only wants `doc_type=cv`, the coverage check for a "team" requirement biases toward `cv` and `company_profile`, etc. Same mechanism — additional `must` conditions on the Qdrant filter.
4. **Cohere rerank.** The top 30 candidates go to Cohere `rerank-v3.5` ([`backend/reranker.py`](backend/reranker.py)) — a cross-encoder that reads query and candidate together rather than as separate embeddings. The top 10 reranked results are returned. Without a Cohere key the system falls back to vector-only — works, just less precise.
5. **Score threshold.** Results below `MIN_FIT_SCORE = 0.75` are dropped before they reach the LLM. Empty retrieval is better than misleading retrieval.
6. **LLM call.** The retained chunks are formatted into a prompt and handed to GPT-4o or Gemini depending on the task — GPT-4o for high-stakes reasoning (fit analysis, proposal generation, chat), Gemini Flash for high-volume rating (coverage, classification, scanning).

### Why this design holds up

- **Docling instead of pypdf.** Public tender documents are full of tables, multi-column layouts, footers and stamps. Naïve PDF text extraction garbles all of that. Docling keeps the structure, which means the chunks downstream actually represent what the document says.
- **HybridChunker over fixed sizes.** Fixed-size chunkers cut sentences in half. Semantic chunking keeps each chunk self-contained, which makes the embedding more meaningful and the LLM context more readable.
- **Per-document classification.** Cheaper than per-chunk and better than nothing. The `doc_type` label powers the filter in step 3, which lets the coverage check for a "compliance" requirement skip CVs entirely instead of competing with them in the ranking.
- **Two-stage retrieval (vector + cross-encoder).** Vector embeddings rank by semantic similarity, which conflates "is about the same topic" with "answers the question". A cross-encoder like Cohere rerank-v3.5 was trained specifically on relevance pairs and re-scores the top candidates for actual answer relevance. Two stages because the cross-encoder is too slow on the whole collection but fast enough on 30 candidates.
- **Tenant filter at the index, not in Python.** With `company_id` as a Qdrant payload index, multi-tenancy is enforced inside the HNSW traversal. Without it, every query would fetch 100+ candidates and throw 99 away — wasted compute, slower latency, and a real risk of forgetting the filter somewhere in user code.
- **Streaming requirement extraction.** Tender PDFs are long and the extraction takes 10–15 seconds. Streaming the requirements as NDJSON means the user sees the table fill in within 1–2 seconds instead of staring at a spinner. Same trick for the live coverage scan.
- **Same RAG, every feature.** Fit-check, coverage, chat, scan, proposal — they all hit the same store with the same filter. There's no parallel "knowledge base" anywhere. Every piece of data the user adds, in any flow, becomes immediately available to every other flow.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 · FastAPI · Uvicorn · Haystack 2.x · `supabase-py` |
| LLMs | Gemini 2.5 Flash (extraction, coverage, classification) · GPT-4o (fit analysis, proposal, chat) · `gemini-embedding-001` (3072d) · Cohere `rerank-v3.5` (cross-encoder) |
| Documents | Docling · `docling-haystack` · HybridChunker (`all-MiniLM-L6-v2` tokenizer, 512 tokens) |
| Vector store | Qdrant Cloud (Frankfurt) · `qdrant-haystack` · payload-indexed multi-tenant filtering |
| Database / auth / storage | Supabase Postgres (RLS on every table, `company_id` derived from JWT) · Supabase Auth · Supabase Storage (`company_documents`, `company_tenders`, both path-prefixed by `company_id`) |
| Frontend | Next.js 16 (App Router · Turbopack) · React 19 · TypeScript 5 · Tailwind v4 · Geist Sans · `@supabase/ssr` |
| Deploy | Vultr VPS Frankfurt (4 GB / 2 vCPU, Ubuntu 24.04) · Docker Compose · Caddy 2 with auto-Let's Encrypt · same-origin path routing |

---

## Repo layout

```
thinCC-/
├── backend/             FastAPI app — RAG pipeline, RAG-grounded extractors,
│                        tender scan/coverage/ranking, proposal engine, share routes
├── web/                 Next.js 16 frontend — dashboard, company knowledge,
│                        tender pages, share links, draft editor
├── supabase/            SQL migrations + setup scripts (one per concern)
├── deploy/              Caddyfile + production deploy guide
├── docker-compose.yml   Three-container production stack
├── start.sh             Local-dev bootstrapper (uvicorn --reload + next dev)
└── final submission/    Hackathon submission artefacts (proposal drafts, deck)
```

---

## Running locally

```bash
git clone <repo>
cd thinCC-
cp .env.production.example .env     # add OPENAI / GEMINI / COHERE / SUPABASE / QDRANT keys

# All three services with one command
docker compose up -d --build

# Or piece by piece (dev mode)
./start.sh                            # uvicorn --reload on :8000 + next dev on :3000
```

`/api/health` returns Qdrant collection status and is used as the smoke test after every deploy.

---

## Credits

Built in a five-person team at the Q-Summit × MLH Hackathon (Mannheim, April 2026):

- **[Lasse Johannis](https://github.com/lassejohannis)** — production deploy on Vultr (Docker + Caddy + Let's Encrypt + same-origin routing), auth & RLS hardening (atomic backend signup with service role to bypass cookie-propagation race), share-link robustness (clipboard activation handling, error surfacing, brute-force-resistant link IDs), Gemini stream-init retry-with-backoff, backend native-libs for Docling at runtime
- **[Paul Eltrop](https://github.com/paul-eltrop)** — tender card UI, share-from-draft flow, OpenAI/Gemini provider swaps, fit-check UI fixes
- **Jona Kösters** — scanner eval-model upgrade to Gemini 2.5 Pro, scrollable-questions + realtime knowledge-state UI, navbar + branding, share button on partial questions
- **[Apostolos Konias](https://github.com/apostoloskonias)** — tender-card enrichment (deadline, filename, upload date)
