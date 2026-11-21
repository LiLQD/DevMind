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
- Redis (optional for development; used for rate limiting)
- A Google Gemini API key

### Backend

```bash
cd server
pnpm install
cp .env.example .env
```

Fill in the required environment variables, then start the development
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
cp .env.example .env
```

Set `VITE_API_URL` to the backend API URL, then run:

```bash
pnpm run dev
```

The frontend starts on `http://localhost:5173`.

## 🔐 Environment Variables

### Backend

---

Variable Description

---

`MONGODB_URI` MongoDB connection string

`JWT_SECRET` Secret used for signing JWT tokens

`GEMINI_API_KEY` Google Gemini API key

`REDIS_URL` Redis URL used for rate limiting;
optional for development
-----------------------------------------------------------------------

### Frontend

Variable Description

---

`VITE_API_URL` Backend API URL

> Never commit real API keys, database credentials, JWT secrets, or
> other sensitive environment variables to the repository.

## 🚢 Deployment

DevMind is designed to be deployed easily using Railway and Vercel.

### Backend --- Railway

1.  Connect the GitHub repository to Railway.
2.  Set the root directory to `server`.
3.  Configure the required environment variables.
4.  Deploy the service.

### Frontend --- Vercel

1.  Connect the GitHub repository to Vercel.
2.  Set the root directory to `client`.
3.  Add `VITE_API_URL` pointing to the deployed backend.
4.  Deploy the frontend.

Both platforms support automatic deployments when changes are pushed to
`main`.

## 📡 API Overview

---

Method Endpoint Description

---

`POST` `/api/auth/register` Create a new user

`POST` `/api/auth/login` Login and get a JWT
token

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
