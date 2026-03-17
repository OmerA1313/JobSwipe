# Stack

## Runtime
- Primary app runtime is `Next.js 15` with the App Router in `app/`.
- Frontend is `React 18` client-side UI in `app/page.tsx`.
- Server logic lives in route handlers under `app/api/`.
- TypeScript is enabled with `strict: true` in `tsconfig.json`.
- Production startup is `npm run start`; development startup is `npm run dev`.

## Data Layer
- Database is `SQLite` via Prisma in `prisma/schema.prisma`.
- Prisma client is initialized in `lib/prisma.ts`.
- Main persisted entities:
  - `UserProfile`
  - `JobPosting`
  - `JobDecision`
  - `Application`
  - `AutomationRun`
  - `AutomationEvent`

## Automation Runtime
- Legacy local worker exists in `scripts/automation-worker.js`.
- Current local browser executor is the Stagehand runner in `tools/stagehand-runner/server.mjs`.
- Stagehand uses:
  - `@browserbasehq/stagehand`
  - local `playwright`
  - local Chromium executable
  - local Ollama model via `OLLAMA_BASE_URL`
- Orchestration can run in `local` or `n8n` mode from `lib/automation-orchestrator.ts`.

## LLM / AI Usage
- Job summary enrichment uses the OpenAI SDK in `lib/job-summary-providers/openai.ts`.
- Card-summary orchestration lives in `lib/job-summary-llm.ts`.
- Browser automation reasoning currently uses Stagehand + Ollama in `tools/stagehand-runner/server.mjs`.
- The codebase still contains workflow files for prior experiments with Anchor, Browserbase, Skyvern, and AI-agent-driven `n8n` flows in `n8n/` and `docs/`.

## Key Dependencies
- App dependencies from `package.json`:
  - `next`
  - `react`
  - `react-dom`
  - `@prisma/client`
  - `openai`
  - `pdf-parse`
- Dev dependencies:
  - `typescript`
  - `prisma`
  - `playwright`

## Tooling and Scripts
- `npm run prisma:generate` regenerates Prisma client.
- `npm run prisma:push` pushes schema to SQLite.
- `npm run automation:worker` runs the older Playwright worker.
- `npm run automation:stagehand` runs the local Stagehand HTTP executor.
- `scripts/dev-share.sh` exists for local sharing.

## Configuration Surface
- Runtime behavior is mostly env-driven.
- Relevant env categories inferred from code:
  - DB: `DATABASE_URL`
  - app/orchestration: `AUTOMATION_ORCHESTRATOR`, `APP_BASE_URL`, `AUTOMATION_SHARED_SECRET`, `N8N_AUTOMATION_WEBHOOK_URL`
  - Stagehand/Ollama: `STAGEHAND_*`, `OLLAMA_*`
  - job sources: `ADZUNA_*`, `GREENHOUSE_BOARDS`, `LEVER_SITES`, `GLASSDOOR_ENABLED`
  - summaries: `OPENAI_API_KEY`, `JOB_SUMMARY_LLM_*`
