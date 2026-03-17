# Structure

## Top-Level Layout
- `app/`
  - Next.js App Router UI and API routes
- `lib/`
  - domain logic, integrations, serialization, and orchestration
- `prisma/`
  - Prisma schema for the SQLite database
- `scripts/`
  - local helper scripts and older automation worker
- `tools/stagehand-runner/`
  - isolated local Stagehand HTTP executor
- `n8n/`
  - workflow JSON exports and experiments
- `docs/`
  - notes for orchestration and workflow setup

## UI Structure
- `app/page.tsx`
  - main client UI for the product
  - contains feed rendering, profile editing, applications, tracking, dev tools
- `app/layout.tsx`
  - minimal shell and metadata
- `app/globals.css`
  - global styling

## API Route Structure
- `app/api/profile/route.ts`
  - profile read/update
- `app/api/jobs/*`
  - feed, refresh, reset, and decision updates
- `app/api/applications/route.ts`
  - manual apply path
- `app/api/automation-ready-jobs/route.ts`
  - jobs that can enter automation
- `app/api/automation-runs/*`
  - queue, detail, answer, action, orchestrator callback/context
- `app/api/resume/parse/route.ts`
  - PDF/text resume extraction

## Domain Modules
- `lib/job-ingest.ts`
  - fan-out to job source adapters
- `lib/job-sources/*.ts`
  - one adapter per source/integration
- `lib/matching.ts`
  - ranking, signals, role/location fit logic
- `lib/apply.ts`
  - tailored resume/cover-letter generation for manual apply
- `lib/automation.ts`
  - automation run lifecycle and serialization
- `lib/automation-orchestrator.ts`
  - orchestrator handshake and callbacks
- `lib/job-summary-llm.ts`
  - LLM enrichment of job-card summaries

## Automation Files
- `scripts/automation-worker.js`
  - older local polling worker
- `tools/stagehand-runner/server.mjs`
  - current local executor server
- `n8n/job-apply-stagehand-orchestrator.workflow.json`
  - deterministic workflow for Stagehand path
- additional `n8n/*.workflow.json`
  - legacy or alternative experiments

## Naming and Organization Patterns
- Route handlers are consistently named `route.ts`.
- Internal modules are grouped by domain rather than by layer package.
- Job source adapters use the `*-public.ts` or source-name pattern.
- Debug summaries are normalized in both automation serialization layers.

## Structural Risks
- `app/page.tsx` is oversized and acts as a monolith.
- `n8n/` contains multiple historical workflow variants, which increases ambiguity.
- Temporary Stagehand browser profile artifacts currently exist in the worktree under untracked `\\wsl.localhost...` paths and should not remain part of normal project structure.
