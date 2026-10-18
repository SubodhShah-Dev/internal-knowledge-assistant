# AI-Powered Internal Knowledge Assistant for Organizations

A full-stack project that lets users upload PDFs or text files, ask natural-language questions, and receive grounded answers based on the uploaded document content. The app is built with React + TypeScript on the frontend and Node.js + Express + TypeScript on the backend, using PostgreSQL for persistence and Ollama for local LLM inference.

This project is designed as a practical internship-level MVP that demonstrates:
- authentication and protected routes
- file upload and validation
- text extraction and chunking
- PostgreSQL full-text retrieval
- grounded LLM answers with references to source excerpts
- secure per-user document ownership

## Live idea

Users can:
- sign up and log in
- upload a PDF or TXT file
- ask questions like "What is the annual leave policy?"
- get an answer based on the content of uploaded documents
- view the supporting excerpts used by the model
- download only their own files

## Tech stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL
- AI Runtime: Ollama (local LLM)
- File parsing: pdf-parse for PDFs
- Auth: bcrypt + JWT
- Testing: Jest + Supertest + Playwright (optional for E2E)

## Core features

- user signup and login
- JWT-based protected routes
- PDF and TXT upload with size and type validation
- extraction of readable text from uploaded files
- chunking of large documents into smaller searchable sections
- PostgreSQL full-text retrieval for document matching
- answer generation grounded in retrieved document excerpts
- display of supporting excerpts and document labels
- no-evidence handling when the uploaded documents do not contain the answer
- per-user ownership checks for fetching or downloading documents

## Project structure

```text
internal-knowledge-assistant/
├── apps/
│   ├── frontend/
│   │   └── src/
│   │       ├── api/
│   │       ├── components/
│   │       ├── pages/
│   │       ├── App.tsx
│   │       └── main.tsx
│   └── backend/
│       ├── src/
│       │   ├── middleware/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── app.ts
│       │   ├── db.ts
│       │   ├── seed.ts
│       │   └── server.ts
│       ├── schema.sql
│       ├── test/
│       └── .env.example
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── LICENSE
└── package.json
```

## Architecture

```text
React + TypeScript UI
        |
        | JWT / JSON API
        v
Express + TypeScript API
        |
        +--> PostgreSQL (users, documents, chunks)
        |
        +--> Local file storage for uploaded PDFs/TXT files
        |
        +--> Ollama local LLM
```

The project uses a simple retrieval-augmented generation pipeline:
1. upload document
2. extract text
3. split into chunks
4. store chunks in PostgreSQL
5. search relevant chunks by keyword/full-text matching
6. pass matching excerpts to a local LLM
7. return answer and supporting sources

## Prerequisites

Before running the project, install:
- Node.js 20+
- npm
- Docker
- Git
- Ollama

## Install and run

### 1. Clone the repo

```bash
git clone https://github.com/SubodhShah-Dev/internal-knowledge-assistant.git
cd internal-knowledge-assistant
```

### 2. Install root dependencies

```bash
npm install
```

### 3. Start PostgreSQL with Docker

```bash
docker compose up -d postgres
```

### 4. Apply the database schema

```bash
psql "postgres://app_user:local_dev_password@localhost:5432/knowledge_assistant" -f apps/backend/schema.sql
```

If you do not have `psql` locally, use the container shell:

```bash
docker compose exec -T postgres psql -U app_user -d knowledge_assistant < apps/backend/schema.sql
```

### 5. Install and run Ollama

```bash
ollama pull qwen3:1.7b
ollama run qwen3:1.7b
```

Keep Ollama running in the background while developing.

### 6. Set environment variables

Create a `.env` file in the project root or within the backend depending on your chosen setup. Example:

```env
PORT=4000
DATABASE_URL=postgres://app_user:local_dev_password@localhost:5432/knowledge_assistant
JWT_SECRET=replace_with_a_strong_secret
FRONTEND_ORIGIN=http://localhost:5173
UPLOAD_DIR=./apps/backend/uploads
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:1.7b
MAX_UPLOAD_MB=10
```

### 7. Run the app

```bash
npm run dev
```

Then open:
- frontend: http://localhost:5173
- backend health check: http://localhost:4000/api/health

## Sample user

A demo user can be created with the seed script or by using the signup route.

Example seed data:
- email: demo@example.com
- password: DemoPassword123!

## Project roadmap

### Phase 1: MVP (1 week)
- user signup/login
- PDF/TXT upload
- text extraction and chunking
- persistent storage in PostgreSQL
- full-text document retrieval
- grounded answer generation using a local LLM
- source excerpts shown to the user
- per-user ownership enforcement
- basic frontend UI

### Phase 2: improvements
- embeddings and vector search
- hybrid keyword + semantic retrieval
- better citations and page references
- stronger access control and workspaces
- DOCX support and OCR for scanned PDFs
- CI/CD and E2E tests

### Phase 3: production hardening
- monitoring and logs
- secure deployment
- backups and retention policy
- deployment review
- performance optimization

## Security notes

This project is an MVP and is not intended for confidential production data without additional hardening.

Key concerns to address before real use:
- secure secret management
- HTTPS and strong CORS settings
- secure cookie strategy if switching from JWT in localStorage
- malware scanning for uploaded documents
- rate limiting and abuse prevention
- data backup and restore process
- retention and deletion policy

## License

This project is licensed under the MIT License.

## Future ideas

Possible enhancements after the MVP:
- semantic search using `pgvector`
- multi-user sharing and document permissions
- chat history and resumeable conversations
- organization-level knowledge base indexing
- document versioning
- file import from Google Drive, Notion, or Git repositories

## Demo workflow

1. sign up / log in
2. upload a PDF or TXT file
3. ask a question about the uploaded content
4. review answer and evidence excerpts
5. confirm the answer is grounded in the uploaded documents

## Notes

This project is intentionally scoped to be realistic but achievable in a short time. The goal is not to build a huge enterprise system in one week, but to build a working, explainable, and credible document Q&A application with real backend logic and a cloud/local LLM.
