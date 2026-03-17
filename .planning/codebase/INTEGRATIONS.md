# Integrations

## Database
- `SQLite` is the only configured datastore through Prisma in `prisma/schema.prisma`.
- No queue broker, cache, or external state store is present.

## Job Source Integrations
- Ingestion is orchestrated from `lib/job-ingest.ts`.
- Implemented adapters under `lib/job-sources/`:
  - `hiremetech.ts`
  - `greenhouse-public.ts`
  - `lever-public.ts`
  - `linkedin.ts`
  - `glassdoor.ts`
  - `themuse.ts`
  - `adzuna.ts`
  - `remotive.ts`
  - `arbeitnow.ts`

## Integration Characteristics
- `Adzuna` requires `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`.
- `HireMeTech` uses a rotating custom API-key derivation strategy in `lib/job-sources/hiremetech.ts`.
- `LinkedIn` uses guest endpoints plus detail-page fetches and an optional `curl` fallback in `lib/job-sources/linkedin.ts`.
- `Greenhouse` and `Lever` rely on public board endpoints with embed/html fallback behavior.
- `Glassdoor` is intentionally stubbed to return nothing unless explicitly enabled, and the adapter documents that browser automation is required for real access.

## LLM / Provider Integrations
- OpenAI Responses API is used for job card summarization in `lib/job-summary-providers/openai.ts`.
- The provider is selected through `lib/job-summary-provider.ts` and consumed by `lib/job-summary-llm.ts`.
- Browser reasoning for automation is local through Stagehand + Ollama in `tools/stagehand-runner/server.mjs`.

## Browser / Automation Integrations
- Stagehand is the active browser executor.
- Playwright is used directly for page/frame interaction and file upload in:
  - `tools/stagehand-runner/server.mjs`
  - `scripts/automation-worker.js`
- `n8n` workflow JSON files are stored in `n8n/`.
- Current active direction in code is deterministic orchestration, not a free-form AI agent workflow.

## Internal HTTP Interfaces
- App API routes form the internal control surface:
  - `/api/profile`
  - `/api/jobs/feed`
  - `/api/jobs/refresh`
  - `/api/jobs/reset`
  - `/api/applications`
  - `/api/automation-ready-jobs`
  - `/api/automation-runs`
  - `/api/automation-runs/[id]`
  - `/api/automation-runs/[id]/answer`
  - `/api/automation-runs/[id]/action`
  - `/api/automation-runs/[id]/orchestrator`
  - `/api/resume/parse`
- The orchestrator callback/context contract is implemented in `lib/automation-orchestrator.ts`.

## File and Resume Handling
- Resume uploads are parsed from multipart form data in `app/api/resume/parse/route.ts`.
- PDFs are parsed with `pdf-parse`.
- Resume binaries are stored directly in the database on both `UserProfile` and `Application`.

## Operational Notes
- There are multiple experimental workflow definitions in `n8n/`.
- There is no evidence of a formal secrets manager or deployment abstraction in the repo.
- Integration reliability depends heavily on environment setup outside the repo: local browser binaries, Ollama availability, and `n8n` networking.
