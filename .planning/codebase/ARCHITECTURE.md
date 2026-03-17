# Architecture

## System Shape
- This is a single Next.js application with an embedded API backend and a local-first automation stack.
- The product combines:
  - job ingestion
  - profile management
  - ranked swipe UI
  - application tracking
  - semi-automated job application execution

## Primary Layers
- UI layer:
  - `app/page.tsx`
  - single large client component that owns most of the product UI state
- API layer:
  - `app/api/**/route.ts`
  - thin route handlers delegating to `lib/`
- domain/service layer:
  - `lib/job-ingest.ts`
  - `lib/matching.ts`
  - `lib/apply.ts`
  - `lib/automation.ts`
  - `lib/automation-orchestrator.ts`
- persistence layer:
  - Prisma through `lib/prisma.ts`

## Data Flow
- Bootstrap path:
  - `ensureBootstrap()` in `lib/bootstrap.ts` ensures a default profile and mock jobs when DB is empty.
- Feed path:
  - route reads profile + jobs
  - filters out applied/decided/active automation jobs
  - ranks with `rankJobsForFeed()` from `lib/matching.ts`
- Apply path:
  - manual apply uses `lib/apply.ts`
  - automation apply uses `enqueueAutomationRun()` and orchestration paths in `lib/automation.ts`
- Automation tracking path:
  - `AutomationRun` stores coarse state
  - `AutomationEvent` stores step-by-step event history
  - route serialization folds event payloads into `debug.anchor`, `debug.browserbase`, `debug.stagehand`

## Automation Architecture
- There are two execution models in code:
  - older local worker loop in `scripts/automation-worker.js`
  - current local Stagehand executor in `tools/stagehand-runner/server.mjs`
- Orchestration mode is abstracted in `lib/automation-orchestrator.ts`.
- `n8n` is treated as workflow control, not source-of-truth storage.
- The app remains the source of truth for:
  - run status
  - blocker question
  - event history
  - application records

## Current Execution Strategy
- Comeet is the main implemented automation target.
- Stagehand is used for high-level reasoning on the page.
- Deterministic Playwright code is used for:
  - entering iframes
  - filling contact fields
  - uploading a PDF
  - checking validation and submit outcomes
- This is a hybrid AI + deterministic browser architecture, not a pure agentic system.

## Cross-Cutting Concerns
- Extensive env-driven branching affects runtime behavior.
- `app/page.tsx` is simultaneously:
  - feed UI
  - profile editor
  - tracking UI
  - dev/admin tooling
- Debug payloads are surfaced directly into the UI, which is useful for local debugging but couples presentation to raw executor output.

## Architectural Tensions
- The system is evolving from prototype to workflow platform.
- The repo still contains multiple generations of automation strategy:
  - direct Playwright worker
  - `n8n` AI-agent experiments
  - Anchor / Browserbase / Skyvern experiments
  - current Stagehand path
- The resulting architecture is functional but historically layered rather than cleanly consolidated.
