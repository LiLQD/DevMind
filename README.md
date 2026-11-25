# DevMind

**AI-powered personal knowledge management for developers.**

DevMind is a full-stack note-taking application that uses semantic
search to help you find technical notes by **meaning**, not just by
keywords. It combines vector embeddings powered by Google Gemini with
hybrid scoring to deliver relevant results even when you don't remember
the exact words you used.

## 🚀 Features

- **Semantic search** -- Find notes by describing what you're looking
  for, even with different phrasing.
- **Hybrid scoring** -- Semantic similarity is the primary ranking
  signal; keyword overlap breaks ties.
- **Collections & tags** -- Organise your knowledge flexibly.
- **Related notes** -- Automatically discover semantically similar
  notes.
- **Embedding status tracking** -- Notes are saved even if AI
  generation fails, providing graceful degradation.
- **Rate limiting** -- Redis-backed rate limiting helps protect the AI
  API from excessive usage.
- **Dark / light theme** -- Choose your preferred workspace look.
- **Keyboard shortcuts** -- `⌘K` to search, `⌘N` for a new note, and
  more.

## 🧰 Tech Stack

Area Technology

---

Frontend React 18 + Vite
Backend Node.js + Express
Database MongoDB (Atlas)
Vector embeddings Google Gemini (`gemini-embedding-001`)
Rate limiting Redis + `express-rate-limit`
Authentication JWT + bcrypt
Deployment Railway (backend), Vercel (frontend)

## 🏗️ Architecture Overview

```text
┌─────────────┐      ┌────────────────┐      ┌─────────────┐
│   Client    │ ──▶ │    Backend     │ ──▶ │   MongoDB   │
│   (React)   │      │ (Node/Express) │      │ (Notes/Users)│
└─────────────┘      └────────────────┘      └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Gemini    │
                    │  Embedding  │
                    └─────────────┘
```

The backend is organised into four layers:

1.  **Controller** -- Handles HTTP requests and responses.
2.  **Service** -- Contains business logic and orchestration.
3.  **Repository** -- Provides data abstraction over MongoDB.
4.  **Strategy** -- Abstracts the AI provider, making it easier to swap
    Gemini for OpenAI or another provider.

## 📁 Project Structure

```text
.
├── client/                 # React + Vite frontend
├── server/                 # Node.js + Express backend
├── README.md
└── ...
```

## 📦 Local Development

### Prerequisites

- Node.js 24+ for local development and tests (compiled backend supports Node.js 20+)
- pnpm (or npm)
- MongoDB (local or MongoDB Atlas)
- Redis (used for rate limiting)
- A Google Gemini API key

### Backend

```bash
cd server
pnpm install
```

Set the required environment variables in `server/.env`, then start the development
server:

```bash
pnpm run dev
```

The backend starts on `http://localhost:8080`.

### Frontend

In another terminal:

```bash
cd client
pnpm install
```

Run the Vite dev server:

```bash
pnpm run dev
```

The frontend starts on `http://localhost:5173` and proxies `/api` to the
local backend. Set `DEVMIND_DEV_API_ORIGIN` if the backend listens on another
origin. Include the exact Vite origin in the backend’s `COOKIE_AUTH_ORIGINS`.

### Mock checkout

For local billing simulation, set `NODE_ENV=development` and
`ENABLE_MOCK_BILLING=true` in the backend environment. Set
`VITE_ENABLE_MOCK_BILLING=true` in `client/.env.local` and restart both dev
servers. Sign in, open **Plan & usage**, and choose **Upgrade to Pro**.

For a hosted demo, set `NODE_ENV=production` and
`ENABLE_PRODUCTION_MOCK_BILLING=true` on the backend. Set
`VITE_ENABLE_MOCK_BILLING=true` in the frontend's production build environment
and redeploy both services. Every signed-in user can simulate a Pro upgrade
and use the Pro semantic-search quota while the backend flag is enabled.
Removing the backend flag disables the mock API and mock Pro access.

## 🔐 Environment Variables

### Backend

---

Variable Description

---

`MONGODB_URI` MongoDB connection string

`COOKIE_AUTH_ORIGINS` Comma-separated browser origins. Use exact HTTPS origins in production and HTTP loopback origins for local development.

`COOKIE_AUTH_JWT_SECRET` Secret used to sign access cookies, at least 32 characters.

`COOKIE_AUTH_CSRF_SECRET` Separate CSRF signing secret, at least 32 characters.

`AUTH_ACCESS_TTL_SECONDS` Access lifetime, defaults to 900.

`AUTH_REFRESH_TTL_SECONDS` Absolute refresh lifetime, defaults to 2592000.

`GEMINI_API_KEY` Google Gemini API key

`REDIS_URL` Redis URL used for rate limiting
-----------------------------------------------------------------------

### Frontend

Variable Description

---

`VERCEL_API_ORIGIN` Backend HTTPS origin for the same-origin API rewrite

> Never commit real API keys, database credentials, JWT secrets, or
> other sensitive environment variables to the repository.

## 🚢 Deployment

The hosted DevMind demo uses Render for the backend and Vercel for the frontend.

### Backend --- Render

1.  Connect the GitHub repository to Render.
2.  Set the root directory to `server`.
3.  Configure the required environment variables.
4.  Deploy the service.

### Frontend --- Vercel

1.  Connect the GitHub repository to Vercel.
2.  Set the root directory to `client`.
3.  Set `VERCEL_API_ORIGIN` to the deployed backend HTTPS origin and include the frontend hostname in `COOKIE_AUTH_ORIGINS` on the backend.
4.  Deploy the frontend.

Both platforms support automatic deployments when changes are pushed to
`main`.

To test same-origin API routing in an isolated preview, set
`VERCEL_API_ORIGIN` to the staging Render HTTPS origin without an `/api`
suffix, allow the exact approved preview origin on the backend, and redeploy.

Authentication uses same-origin cookies. Keep the existing cookie secrets and session database during a coordinated rollout so existing sessions can continue. Previously issued bearer tokens are rejected, and users with only a legacy token need to sign in again.

## 📡 API Overview

---

Method Endpoint Description

---

`POST` `/api/auth/register` Create a new user

`POST` `/api/auth/login` Sign in and set session cookies

`GET` `/api/notes` List all user notes;
supports tag/collection
filtering

`POST` `/api/notes` Create a new note and
trigger embedding
generation

`GET` `/api/notes/:id` Get a note with related
suggestions

`PUT` `/api/notes/:id` Update a note

`DELETE` `/api/notes/:id` Delete a note

`POST` `/api/notes/search` Perform semantic search
using a
natural-language query

`GET` `/api/collections` List user collections

`GET` `/api/tags` List user tags
-----------------------------------------------------------------------

Full API documentation is available in the source code.

## 🧠 Semantic Search Design

DevMind uses a dual-scoring approach to combine semantic understanding
with useful keyword signals.

### 1. Semantic Score

The query is converted into an embedding using the Gemini embedding
model. Each note also has an embedding.

DevMind calculates the **cosine similarity** between the query embedding
and each note embedding.

A higher semantic score means the note is more semantically related to
the query.

### 2. Keyword Ratio

DevMind also calculates the fraction of meaningful query words that
appear in the note's title or content.

This provides an additional signal when multiple notes have very similar
semantic scores.

### 3. Hybrid Ranking

Semantic similarity remains the **primary ranking signal**.

When several notes have very close semantic scores --- within `0.05` ---
the keyword ratio is used as a tie-breaker.

This keeps search focused on **meaning** while still rewarding useful
keyword overlap.

### Example

A user might search:

> "How do I temporarily save my uncommitted Git changes?"

Even if the user does not remember the exact wording of a note such as
**"Git Stash and Cherry-Pick"**, semantic search can still identify it
as a relevant result.

## 🛡️ Graceful AI Failure Handling

Embedding generation is treated as an enhancement rather than a
requirement for successfully saving a note.

If the Gemini embedding service fails:

1.  The note can still be saved.
2.  Its embedding status is recorded as failed.
3.  The user does not lose the note because of an external AI/API
    failure.
4.  Semantic-search functionality can continue for notes that have valid
    embeddings.

This design allows the core note-taking functionality to degrade
gracefully when the AI service is temporarily unavailable.

## 👥 Contributing

DevMind is a student project, but contributions are welcome.

If you have an improvement:

1.  Fork the repository.
2.  Create a feature branch.
3.  Make your changes.
4.  Commit and push your branch.
5.  Open a pull request.

For bugs or feature ideas, please open an issue.
