# Automation Execution

This document is the Phase 1 source of truth for browser execution.

## Labels

- `active`: supported path used by the app today
- `experimental`: real research direction that may replace or augment the active path later
- `deprecated`: old paths kept out of runtime because they no longer represent the product

## Current Contract

- The app is the source of truth for jobs, profile data, automation runs, events, and application records.
- `n8n` is transport and orchestration only.
- The executor receives normalized run context and returns normalized outcomes and evidence.
- Application records and automation-run outcomes are separate concepts:
  - automation runs track execution state and evidence
  - application records track actual submitted applications

## Status

### `active` — Stagehand LOCAL + Playwright

Use this path for the MVP.

- Local Chromium execution through Stagehand
- Local model reasoning through Ollama
- Deterministic browser actions for fill, upload, and submit checks
- `n8n/job-apply-stagehand-orchestrator.workflow.json` is the only supported orchestrator workflow
- `tools/stagehand-runner/server.mjs` is the supported local executor
- For live local watching, run the executor headful:
  - `npm run automation:stagehand:live`
  - or set `STAGEHAND_HEADLESS=0`

Why this is active:

- lowest current cost
- local-first
- easiest path to stable ATS-family automation
- keeps the app state model independent from any paid browser vendor

### `experimental` — Browser Use

Browser Use is the main experimental alternative.

- promising for stronger agentic browser reasoning
- worth testing if Stagehand stalls on page understanding or control quality
- not part of the supported runtime in Phase 1

### `deprecated` — managed-browser experiments and `n8n` AI-agent paths

These are not supported runtime paths anymore:

- Anchor orchestrator experiments
- Browserbase orchestrator/tool experiments
- `n8n` AI-agent workflow variants
- the old local `scripts/automation-worker.js` worker

Why they are deprecated:

- they increased repo ambiguity
- they implied support paths that are no longer real
- they introduced vendor/model cost and reliability tradeoffs that do not fit the current MVP direction

## Normalized Executor Output

The executor should return:

- `status`
  - `SUBMITTED`
  - `NEEDS_INPUT`
  - `FAILED`
- `currentStep`
- `needsInput`
- `blockingQuestion`
- `inputField`
- `lastError`
- `message`
- `level`
- `payload`

The payload may include provider-specific evidence, but the app-visible contract must stay normalized enough for tracking to show:

- status
- blocker or current step
- screenshot evidence
- action trace
- raw payloads

## Operational Rule

When evaluating or adding browser tooling:

- update this document first
- explicitly label the path as `active`, `experimental`, or `deprecated`
- do not leave dead executable artifacts in the repo as apparent options
