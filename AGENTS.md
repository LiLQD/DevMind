# DevMind — Codex Project Instructions

## Project

DevMind is an AI-powered personal knowledge-management application.

Current stack:

- Frontend: React 19 and Vite
- Backend: Node.js and Express 5
- Persistence: MongoDB and Mongoose
- Rate limiting: Redis
- Embeddings: Gemini
- Package manager: pnpm

Inspect the repository's manifests and implementation before assuming a version, script, or documented behavior is current.

## Development workflow

1. **Inspect first.** Read the relevant code, tests, configuration, and nearby documentation before proposing a change.
2. **One small slice at a time.** Explain the intended change and wait for explicit approval before editing. An approved task does not authorize unrelated refactors.
3. **Preserve behavior.** Unless explicitly approved, keep existing request and response shapes, status codes, authentication and authorization behavior, note persistence, embedding-failure behavior, and search ranking.
4. **Prefer maintainability over ceremony.** Follow existing framework conventions; avoid speculative abstractions, wholesale rewrites, or new dependencies without a concrete reason.
5. **Verify each approved patch.** Run `pnpm check` from the repository root after edits. Run focused tests when relevant. State any checks that could not run and why.
6. **Explain decisions.** For non-trivial changes, give 2–3 sentences explaining WHY the change is necessary, plus the files affected, verification results, and remaining risks.
7. **Use a dedicated branch and PR for approved patches.** Start the feature branch from the latest `origin/main` and preserve unrelated working-tree changes. After verification, stage only the patch files, create a Conventional Commit, push the branch, and open a PR targeting `main`. Monitor CI and hand the PR back to the user for review. The user controls the merge.
8. **Clean up merged feature branches.** Wait for the user to review and merge the PR. Before cleanup, verify the merge and confirm that the local and remote branch tips contain no work beyond the reviewed PR. Fast-forward local `main` and remove the merged feature branch locally and on the remote.

## TypeScript modernization

- Migrate incrementally; do not convert the full application in one patch.
- Establish or extend regression tests before modifying risky runtime behavior.
- Favor strict TypeScript and clear runtime validation at trust boundaries; avoid `any` and unsafe assertions where practical.
- Keep React, Vite, Express, Mongoose, Redis, and Gemini unless a change is separately approved.
- Separate TypeScript conversion from unrelated architecture or behavior changes whenever possible.

## Project-local skills

Relevant skills are stored under `.agents/skills/`. Use them when they fit the task; their advice is not a mandate to introduce unnecessary technologies.

- `nodejs-express-skill` — Express routes, middleware, and backend structure
- `react-architecture` — React components, state, and organization
- `data-nosql-database` — MongoDB/Mongoose modeling and query considerations
- `quality-unit-testing` — focused unit tests and test design

These project instructions take precedence over generic recommendations from third-party skills.
