# Science Research Portal

A focused Science Olympiad research workspace that pairs Gemini-assisted exploration with local notes and source tracking.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/science-research-portal` — responsive research workspace UI
- `artifacts/api-server/src/routes/gemini.ts` — server-side Gemini research endpoint
- `lib/api-spec/openapi.yaml` — source of truth for the research API contract

## Architecture decisions

- Gemini requests stay server-side so the API key is never exposed to the browser.
- Notes and source links are intentionally browser-local for a lightweight school research session.
- The prompt emphasizes primary-source verification and avoids invented citations.

## Product

- Ask focused research questions with optional subject and context.
- Review, copy, and save AI responses as notes.
- Keep a source shelf of URLs to verify.
- Clear a local session when starting a new topic.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API expects `GEMINI_API_KEY` in Replit Secrets.
- The Gemini provider may retire model identifiers; keep the model name aligned with the provider's current response.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
