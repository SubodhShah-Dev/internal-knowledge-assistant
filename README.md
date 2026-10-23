# AI-Powered Internal Knowledge Assistant for Organizations

Upload a PDF or plain-text file, then chat: ask questions in natural language and watch answers stream in token by token—grounded in your own documents, with supporting excerpts, honest "not in these documents" abstentions, and a **Groundedness Audit** that verifies every claim against its cited evidence. Conversations are saved as sessions you can revisit, rename, and delete from a ChatGPT-style sidebar.

Built as a realistic one-week MVP: React + TypeScript + Vite, Node.js + Express + TypeScript, PostgreSQL, and any OpenAI-compatible LLM—local Ollama or a free-tier cloud provider (Groq/Gemini/OpenRouter). No paid AI service required.

What this project demonstrates end to end:

- authentication (signup/login) and JWT-protected routes
- PDF/TXT upload with size/type validation and per-user ownership
- text extraction, chunking, and persistent storage
- PostgreSQL full-text retrieval (`websearch_to_tsquery` + `ts_rank`)
- LLM answers grounded in retrieved excerpts via a provider-agnostic client
- **Groundedness Audit**: claim-level citation validation, entailment verification, 0–100 score, persisted audit trail
- chat sessions with SSE token streaming, multi-turn context, and a sessions sidebar
- document library UI with download and a real-browser E2E smoke test

## Features

- signup/login; JWT stored client-side; automatic logout on 401
- upload PDF or TXT (10 MB limit); unsupported/oversized files rejected with clear errors
- text extraction (pdf-parse v2), chunking (~900 chars, 120 overlap), original file stored under a generated name
- ask questions; relevant chunks retrieved with PostgreSQL full-text search
- **chat sessions**: every exchange lands in a persistent session; multi-turn prompt (last 6 turns) with fresh retrieval per question; rename/delete from the sidebar; reload restores the thread
- **SSE streaming**: answers stream token by token (`sources` → `token`* → `verification` → `done`); a Stop button aborts the stream and the partial turn is not persisted; plain-JSON clients still get the full response
- dark-by-default UI with a light-mode toggle (persisted, no theme flash)
- answer generated from retrieved excerpts only, with `[S1]`-style citations
- **Groundedness Audit**: each claim checked against its cited excerpts by a second LLM pass → SUPPORTED / PARTIAL / UNSUPPORTED / NO CITATION, plus an overall 0–100 score, persisted in `answer_verifications`
- abstention when retrieval finds nothing ("I could not find the answer in the uploaded documents")—no sources, no audit, no LLM call
- document library list, protected download of your own files only
- LLM outage returns HTTP 503 with a clear message, never a 500

## Tech stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL (Docker), full-text search
- **LLM:** OpenAI-compatible client — Groq free tier (default), Google Gemini, OpenRouter, or local Ollama via env config
- **File parsing:** pdf-parse v2 (PDFs), plain-text read (TXT), multer v2 upload
- **Auth:** bcrypt + JWT
- **Testing:** Jest + Supertest (unit + integration) and Playwright (E2E smoke)

## Project structure

```text
internal-knowledge-assistant/
├── apps/
│   ├── frontend/
│   │   ├── e2e/                    # Playwright smoke test + fixture
│   │   ├── playwright.config.ts
│   │   └── src/
│   │       ├── api/client.ts       # typed fetch wrapper, auth token, SSE ask stream
│   │       ├── components/         # Sidebar, ChatPage thread (ChatMessage, Composer),
│   │       │                       # DocumentsModal, SourceList, VerificationPanel,
│   │       │                       # RichText, UploadForm, DocumentList, icons
│   │       ├── pages/              # LoginPage, ChatPage
│   │       ├── router.tsx          # routes, auth guard, layout + sessions
│   │       ├── theme.ts            # dark/light theme (pre-paint)
│   │       ├── types.ts
│   │       └── main.tsx
│   └── backend/
│       ├── src/
│       │   ├── middleware/         # auth (JWT)
│       │   ├── routes/             # auth, documents, questions (+SSE), conversations
│       │   ├── services/           # llm (OpenAI-compatible), extractText,
│       │   │                       # chunkText, verifyAnswer (Groundedness Audit)
│       │   ├── app.ts              # express app, CORS, routes, error mapping
│       │   ├── db.ts               # pg pool (root .env)
│       │   ├── seed.ts             # demo user
│       │   └── server.ts           # entrypoint
│       ├── schema.sql              # users, documents, chunks, conversations,
│       │                           # qa_history, answer_verifications
│       ├── test/                   # jest config, global setup, fixtures,
│       │                           # unit + integration tests
│       └── .env.example
├── docker-compose.yml              # postgres only
├── .env.example
└── package.json
```

## Architecture

```text
React + TypeScript UI (Vite, :5173)
        |
        | JWT / JSON API + SSE answer stream
        v
Express + TypeScript API (:4000)
        |
        +--> PostgreSQL (users, documents, chunks, conversations,
        |                 qa_history, answer_verifications)
        |
        +--> Local file storage (original uploads, generated filenames)
        |
        +--> OpenAI-compatible LLM (Groq / Gemini / OpenRouter / Ollama)
                answer pass (grounded in retrieved excerpts)
                verifier pass (Groundedness Audit, temperature 0)
```

The retrieval-augmented generation pipeline:

1. upload document → extract text → reject empty/scanned-only files
2. split into overlapping chunks → persist file, metadata, chunks
3. on a question: full-text search over the owner's chunks → top excerpts labeled `[S1]`, `[S2]`, …
4. answer with the LLM using only those excerpts (instructions treat excerpts as untrusted data); the last 6 conversation turns are included as context, retrieval stays fresh per question
5. **audit**: parse claims → validate citation labels against actually-returned sources → LLM entailment check per claim → score 0–100 → persist in the same transaction as the answer
6. stream `{ sources, tokens…, verification, done }` over SSE (or return `{ answer, sources, verification }` as JSON); the turn and its session are persisted with the answer

If retrieval returns nothing, the API short-circuits with an honest abstention (no LLM call). If the verifier fails or times out, claims degrade to `unverified`—the answer is always delivered.

## Prerequisites

- Node.js 20+
- npm
- Docker (for Postgres)
- a free LLM API key **or** local Ollama (both optional until you ask a question)

## Install and run

### 1. Clone the repo

```bash
git clone https://github.com/SubodhShah-Dev/internal-knowledge-assistant.git
cd internal-knowledge-assistant
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 4. Apply the schema

```bash
docker compose exec -T postgres psql -U app_user -d knowledge_assistant < apps/backend/schema.sql
```

(If you have local `psql`: `psql "postgres://app_user:local_dev_password@localhost:5432/knowledge_assistant" -f apps/backend/schema.sql`)

### 5. Configure the environment

Copy `.env.example` to `.env` in the repo root and fill in:

```env
PORT=4000
DATABASE_URL=postgres://app_user:local_dev_password@localhost:5432/knowledge_assistant
JWT_SECRET=replace_with_a_strong_secret      # openssl rand -hex 32
FRONTEND_ORIGIN=http://localhost:5173
UPLOAD_DIR=uploads                            # resolved against apps/backend
MAX_UPLOAD_MB=10

# LLM: pick a provider — same protocol for all of them
LLM_BASE_URL=https://api.groq.com/openai/v1   # or http://127.0.0.1:11434/v1 (Ollama)
LLM_API_KEY=...                               # free key from console.groq.com/keys (omit for Ollama)
LLM_MODEL=openai/gpt-oss-120b                 # or qwen3:1.7b on Ollama
LLM_TIMEOUT_MS=60000
```

Free-tier options (no credit card): **Groq** (fastest), **Google AI Studio/Gemini** (largest quota), **OpenRouter** (`:free` models). For fully offline use, run Ollama and point `LLM_BASE_URL` at it.

### 6. (Optional) seed a demo user

```bash
npm run seed -w apps/backend
```

Creates `demo@example.com` / `DemoPassword123!`.

### 7. Run the app

```bash
npm run dev
```

- frontend: http://localhost:5173
- backend health: http://localhost:4000/api/health

Sign up (or use the seeded demo user), upload a PDF or TXT, and ask a question.

## Testing

```bash
# unit + integration (50 tests): auth, upload validation, ownership isolation,
# retrieval, grounded answer with mocked LLM, abstention, 503 on LLM outage,
# claim parsing, all Groundedness Audit paths, ledger persistence
npm test

# typecheck both workspaces
npm run typecheck

# E2E smoke (real browser, real stack, real LLM): signup → upload handbook →
# ask → answer + sources + audit panel → download → hard abstention → logout
# requires Docker Postgres + a populated .env; reuses running dev servers
npm run test:e2e
```

The E2E fixture is a synthetic employee handbook (`apps/frontend/e2e/fixtures/employee-handbook.txt`)—no real company data.

## Groundedness Audit

Generic chat-with-PDF agents return an answer and ask you to trust the excerpts. This assistant **audits** the answer against them:

1. the answer is decomposed into sentence-level claims with their `[S#]` citation labels
2. citations are validated structurally (no label → `uncited`; label not among returned sources → `unsupported`)—no LLM needed for either
3. remaining claims go through a second LLM pass (temperature 0) that rules each `supported`, `partial`, or `unsupported` against its cited excerpts
4. overall score = `100 × (supported + 0.5×partial) / total`; status `verified | partial | unsupported | unverified`
5. the audit is persisted in `answer_verifications` alongside the answer

The UI shows a meter, an overall badge, and per-claim verdicts. Verifier failure never blocks an answer—it degrades to `unverified`. See the roadmap doc (§ Groundedness Audit) for the full design rationale.

## Security notes

This is an MVP, not production software. Do not upload confidential documents without further hardening. Before real use: secret management, HTTPS and strict CORS, HttpOnly cookies instead of localStorage JWTs, malware scanning for uploads, rate limiting, backups, and a retention/deletion policy.

Notable MVP trade-offs already in place: uploads stored on local disk with generated filenames (never user-controlled paths), ownership checks on every document access, excerpts rendered as text (never `dangerouslySetInnerHTML`), and prompt instructions that treat document content as untrusted data.

## Roadmap

**Phase 1 — done:** auth, upload+extraction+chunking, full-text retrieval, grounded answers, Groundedness Audit with persistence, document library UI, unit/integration/E2E tests.

**Phase 2 — next:**
- embeddings + `pgvector` for semantic/hybrid retrieval
- page-level citations
- admin view over the audit ledger ("worst-grounded answers this week")
- batch-per-sentence verification; re-prompt answers missing citations
- DOCX and OCR support
- CI/CD

**Phase 3 — production hardening:** monitoring, secure deployment, backups/retention, performance.

## License

MIT — see [LICENSE](LICENSE).

## Demo workflow

1. sign up / log in
2. upload a PDF or TXT file
3. ask a question about its content
4. read the answer, its `[S#]`-labeled excerpts, and the Groundedness Audit
5. ask a question the documents cannot answer and see the honest abstention
