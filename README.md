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

### AI-assisted note organization

In the note editor, choose **Suggest tags & collection** for a typed draft or
a single imported Markdown file. DevMind sends the draft title, up to 2,400
characters of content, and up to 40 tag names and 40 collection names from
your account to Gemini. You can accept or dismiss individual suggestions or apply them together.
Accepted suggestions are saved through the normal note form.

The backend defaults to Gemini 3.1 Flash-Lite. Set
`GEMINI_SUGGESTION_MODEL` to another Gemini text model that supports
structured JSON for your key. Set `GEMINI_SUGGESTION_TIMEOUT_MS` to change
the default 10,000 ms generation deadline. Each account can request
suggestions up to 10 times per hour. Generation attempts have a separate
internal usage counter and do not use semantic-search quota.

### Existing database tag index migration

After deploying the backend revision with account-scoped tag uniqueness, run
the maintenance command once for each existing database that has the legacy
global tag index. Provide `TAG_INDEX_MIGRATION_MONGODB_URI` explicitly through
the operator environment. The URI must select the intended database.

```sh
node server/scripts/migrate-account-scoped-tag-index.mjs
```

The command verifies the compound unique index on `tags` and drops the legacy
`name_1` index only if its definition matches. Reruns are safe. Tag records,
note references, and unrelated indexes are preserved. Once different accounts
share tag names, a backend rollback must retain the account-scoped schema.

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

### Optional Google sign-in

1. Open [Google Auth Platform](https://console.cloud.google.com/auth) in your Google Cloud project. In **Branding**, set the app name to DevMind, provide a support email and developer contact, and configure the public home page, privacy policy, and authorized domains for the deployment. Use a verified, owned custom domain if Google cannot verify the shared Vercel hostname for your branding. The origin in the steps below must then be that custom domain.
2. In **Audience**, choose **External** for personal Google accounts. Keep the app in **Testing** for the first smoke test and add the accounts you intend to test with if Google asks for test users. In **Data Access**, request only `openid`, `email`, and `profile`. Google exempts these basic identity scopes from sensitive-scope verification and the usual test-user restrictions. Review the branding requirements before publishing the production app. [Google publishing and verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
3. In **Clients**, create a **Web application** OAuth client. Add the exact **Authorized redirect URI** and leave Authorized JavaScript origins empty for this server-side flow. Use separate credentials for development and production.

   | Environment | Application origin                 | Authorized redirect URI                                     |
   | ----------- | ---------------------------------- | ----------------------------------------------------------- |
   | Local Vite  | `http://localhost:5173`            | `http://localhost:5173/api/auth/google/callback`            |
   | Hosted demo | `https://dev-mind-nine.vercel.app` | `https://dev-mind-nine.vercel.app/api/auth/google/callback` |

4. On Render, configure the following variables. For local testing, set them in the server's ignored environment file. Keep `GOOGLE_AUTH_ENABLED=false` for the first production deployment.

   | Variable                    | Value                                                                       |
   | --------------------------- | --------------------------------------------------------------------------- |
   | `GOOGLE_AUTH_ENABLED`       | `false` by default. Set to `true` in the configured smoke-test environment. |
   | `GOOGLE_AUTH_CLIENT_ID`     | Web application client ID.                                                  |
   | `GOOGLE_AUTH_CLIENT_SECRET` | Web application client secret. Store on the backend only.                   |
   | `GOOGLE_AUTH_APP_ORIGIN`    | Exact public application origin, also present in `COOKIE_AUTH_ORIGINS`.     |
   | `GOOGLE_AUTH_CALLBACK_URI`  | Exact registered URI from the table for that origin.                        |

5. Deploy Render, then Vercel. Keep the existing `VERCEL_API_ORIGIN` set to the Render backend's bare HTTPS origin. The existing same-origin rewrite forwards the callback to Express. Vercel needs no Google environment variables. Use a fixed approved origin for each OAuth client. Keep Google disabled on dynamic preview URLs. Ensure platform access logs, analytics, and error monitoring omit the callback query string and all cookie headers.
6. Before enabling production, complete a real Google sign-in on the explicitly configured development or staging origin. Check that the browser returns to DevMind and that reload and logout work. Verify MongoDB has the unique partial index on `accounts.identities.google` and that Redis supports `GETDEL` (Redis 6.2 or later). Mongoose builds the additive index on schema initialization. Deployments with automatic index creation disabled must provision this specific index before enabling Google. Publish the production OAuth app when ready, then set `GOOGLE_AUTH_ENABLED=true` on Render and redeploy.
7. To roll back Google sign-in, set `GOOGLE_AUTH_ENABLED=false` and redeploy Render. Existing DevMind sessions and password sign-in continue to work. Provider-only accounts need Google enabled again to start a new session.

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
