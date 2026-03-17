# Testing

## Current State
- There is no dedicated automated test suite in the repo.
- No `__tests__/`, `*.test.ts`, `*.spec.ts`, Jest, Vitest, or Playwright test project structure is present.
- Quality verification currently relies on:
  - `tsc --noEmit`
  - `next build`
  - manual runtime testing
  - live automation runs

## Existing Verification Scripts
- `npm run build`
  - Prisma generate + Next production build
- `npm run lint`
  - Next lint hook, but no custom ESLint config is visible
- `npm run prisma:generate`
  - schema/client sanity step

## What Gets Tested Informally
- API routes are exercised manually through the UI and direct HTTP calls.
- Automation flows are validated through real browser sessions and event logs.
- `n8n` workflows are validated through live webhook executions rather than automated tests.

## High-Risk Untested Areas
- Job-source parsing and HTML scraping logic in `lib/job-sources/*.ts`
- Ranking logic in `lib/matching.ts`
- Automation state transitions in `lib/automation.ts`
- Orchestrator callback semantics in `lib/automation-orchestrator.ts`
- Stagehand browser executor behavior in `tools/stagehand-runner/server.mjs`
- Resume parsing and binary handling in `app/api/resume/parse/route.ts`

## Suggested Test Layers
- Unit tests:
  - ranking and matching helpers
  - job-source normalization utilities
  - automation event/debug serialization
- Integration tests:
  - API routes with a temporary SQLite DB
  - orchestrator callback flows
- Browser automation tests:
  - mocked or fixture-based verification of field-fill and blocker detection logic

## Testing Constraints
- Real browser automation depends on local Chromium and Ollama availability.
- External job boards are hostile to deterministic CI tests.
- Because the app uses live third-party sites, a fully reliable CI browser suite would need fixture pages or recorded HTML snapshots.

## Practical Assessment
- The project has build validation, not a test safety net.
- Refactoring automation or scraping code currently carries meaningful regression risk.
