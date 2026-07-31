# AI Document Q&A Assistant (RAG)

Upload a PDF, ask questions about it, get answers grounded in the actual document — with page-level citations, not hallucinated guesses.

Built to explore Retrieval-Augmented Generation (RAG) end-to-end: text extraction, chunking, semantic embeddings, vector similarity search, and grounded answer generation, all on free-tier infrastructure.

## How it works

**On upload:**
1. PDF is saved to Supabase Storage
2. Text is extracted page-by-page (`pdf-parse`)
3. Each page is split into overlapping ~150-word chunks (30-word overlap, so no sentence loses context at a chunk boundary)
4. Each chunk is embedded into a 768-dimension vector using Gemini's `gemini-embedding-001`
5. Chunks + embeddings are stored in Postgres (Supabase) via the `pgvector` extension

**On a question:**
1. The question is embedded using the same model (different `taskType` — `RETRIEVAL_QUERY` vs. `RETRIEVAL_DOCUMENT` — for better retrieval quality)
2. Postgres runs a cosine similarity search (`pgvector`) to find the top 5 most relevant chunks, scoped to that document and that user
3. Those chunks + the question are sent to Gemini Flash, which is instructed to answer *only* from the provided context and cite page numbers
4. The answer is returned along with which pages it drew from

## Tech stack

| Layer | Tool |
|---|---|
| Frontend + hosting | Next.js (App Router), Vercel |
| Auth | Supabase Auth (magic link) |
| File storage | Supabase Storage |
| Database + vector search | Supabase Postgres + `pgvector` |
| Embeddings | Gemini `gemini-embedding-001` |
| Answer generation | Gemini Flash |
| PDF text extraction | `pdf-parse` |

Everything runs on free tiers — no credit card required, no paid infrastructure.

## Why RAG instead of just prompting the whole PDF?

Stuffing an entire document into a single prompt doesn't scale (context limits, cost, and the model has to "search" the whole thing itself every time). RAG instead retrieves *only* the relevant slice of the document per question, which is faster, cheaper, and — because the model is answering from a narrow, specific context — less prone to making things up. The page citations here exist specifically to make that grounding checkable, not just claimed.

## Setup

1. Clone the repo and install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Create a Supabase project, run `supabase/schema.sql` in the SQL editor (enables `pgvector`, creates tables, the `match_chunks` similarity search function, storage bucket, and Row Level Security policies).

3. Copy `.env.example` to `.env.local` and fill in:
    - Supabase project URL + publishable key (Settings → API)
    - Supabase secret key (Settings → API — server-only, never exposed to the browser)
    - Gemini API key (aistudio.google.com/apikey)

4. Run the dev server:
   \`\`\`bash
   npm run dev
   \`\`\`

5. Go to `/login`, sign in via magic link, then `/upload` to try it.

## Known limitations

- **Serverless timeouts**: on Vercel's free tier, very long PDFs (many pages → many chunks, each requiring a sequential embedding call to stay within Gemini's free-tier rate limit) could exceed the default function timeout. Fine for typical documents; a production version would move ingestion to a background job.
- **No persistent chat history**: conversation state lives in React state per session — refreshing the page clears it. Would need a `chat_messages` table to persist.
- **Single-document Q&A**: each chat is scoped to one uploaded document, not cross-document search.

## Architecture

Two flows: one-time ingestion (upload → extract → chunk → embed → store), and per-question retrieval (embed question → similarity search → generate grounded answer).

Row Level Security is enforced at the database level, so even with a compromised frontend, users can only ever access their own documents and chunks.