---
phase: 01
slug: stabilize-the-mvp-core
status: complete
created: 2026-03-17
updated: 2026-03-17
---

# Phase 1 Research — Stabilize the MVP Core

## Question

What do we need to know to plan Phase 1 well, given the current brownfield MVP, the local-first cost constraint, and the need to keep browser automation as the center of the product rather than a side experiment?

## Inputs Read

- `.planning/phases/01-stabilize-the-mvp-core/01-CONTEXT.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/STRUCTURE.md`
- `app/page.tsx`
- `lib/automation.ts`
- `lib/automation-orchestrator.ts`
- `tools/stagehand-runner/server.mjs`
- `package.json`
- official docs and public product material listed in Sources

## Current State of the Repo

### What is already good enough to build on

- The app is already the source of truth for runs, events, applications, and profile state.
- The API surface for automation context and callbacks already exists.
- The current Stagehand runner is not a toy script. It already combines Stagehand reasoning with deterministic Playwright actions for:
  - entering the Comeet apply iframe
  - filling core contact fields
  - uploading the resume PDF
  - identifying blockers and snapshots
- Tracking already stores structured debug data for multiple executor families.

### What is still unstable

- `app/page.tsx` is still a product monolith. Tracking, profile/resume, feed, dev tools, and automation testing all live in one client component.
- The repo still contains multiple generations of automation strategy:
  - `scripts/automation-worker.js`
  - legacy `n8n` vendor workflows
  - current Stagehand runner
- The debug contract is duplicated across `lib/automation.ts` and `lib/automation-orchestrator.ts`.
- The runner is leaking local Chromium profile artifacts into `tools/stagehand-runner/` and the broader worktree.
- There is no test framework yet. Only build and type checks exist.

## Brownfield Stabilization Implications

Phase 1 should not try to invent a new product architecture. It should reduce ambiguity in the one that already exists.

The codebase already implies the correct ownership model:

1. App owns product state
2. Executor produces evidence and normalized outcomes
3. Orchestrator is transport, not authority

That should become explicit in Phase 1.

### What must become obvious after Phase 1

- which execution path is currently active
- which paths are experimental versus dead
- where UI responsibilities live
- what evidence a failed or paused automation run is required to preserve
- how the executor contract is shaped, even if it stays loose

## Browser Execution Research

### Strongest current fit: Stagehand LOCAL + Playwright

This remains the strongest Phase 1 primary path.

Why:
- local-first and low cost
- already partially integrated in this repo
- Stagehand explicitly supports model configuration and browser control patterns that fit hybrid execution
- Playwright remains the most reliable primitive for form input, file upload, and submit verification

What the official docs reinforce:
- Stagehand positions `observe()` as a structured way to identify possible next actions before acting: `https://docs.stagehand.dev/v3/basics/observe`
- Stagehand model configuration supports local and self-hosted models, which keeps the MVP aligned with local-first cost constraints: `https://docs.stagehand.dev/v3/configuration/models`
- Stagehand recommends deterministic-agent patterns and caching to turn exploratory agent flows into faster, more repeatable scripts: `https://docs.stagehand.dev/v3/best-practices/deterministic-agent`
- Playwright remains the right deterministic primitive for filling fields, selecting options, clicking, and uploading files: `https://playwright.dev/docs/input`

What this means for Phase 1:
- keep AI as a first-class interpreter of page state and entry points
- do not let AI own the entire transaction
- preserve deterministic last-mile actions for fields, uploads, and submit confirmation

### Best alternative worth keeping active as experimental: Browser Use

`Browser Use` is the strongest alternative to keep under active evaluation in Phase 1.

Why:
- open-source, local-friendly, and compatible with local/self-hosted model setups including Ollama according to its supported-model documentation: `https://docs.browser-use.com/open-source/supported-models`
- can pair with direct browser control and Playwright-style flows, which keeps the architecture close to the current repo direction

What this means for Phase 1:
- Browser Use should stay available as an experimental branch of the executor strategy
- but it should not replace the current Stagehand path in Phase 1 unless the existing runner proves structurally blocked

### What should not drive the MVP architecture

Paid managed browser agents or cloud anti-bot products should not define the active Phase 1 path.

Reason:
- they conflict with the near-zero-cost constraint
- they add provider churn before the internal executor contract is stable
- the repo already learned this lesson through Anchor and Browserbase experiments

Phase 1 should preserve a migration path to future paid browser infrastructure, but not optimize the current architecture around it.

## Public Market Pattern Research

Public product pages for adjacent products consistently suggest the same product pattern:

- browser extension or local browser presence
- strong autofill/profile store
- ATS-family and form autofill emphasis rather than universal site guarantees
- application tracking and transparency as part of the user value proposition

Examples:
- Simplify emphasizes extension-based autofill and centralized job/application management: `https://simplify.jobs/`
- AIApply emphasizes auto-apply plus ATS resume optimization and tailored documents: `https://aiapply.co/`
- LazyApply markets broad platform coverage and profile-driven autofill: `https://lazyapply.com/`

Useful implication:
- the market does not validate a pure “one magic agent handles every job site” architecture
- the public product pattern is closer to:
  - strong profile memory
  - repeatable autofill behavior
  - partial ATS specialization
  - tracking visibility

That aligns with the hybrid executor direction already emerging in this repo.

## UI Stabilization Research Applied to This Repo

### Highest-value extraction target

The user’s earlier decision to extract `Tracking` and `Profile/Resume` first is correct.

Reason:
- profile/resume state is a hard prerequisite for automation credibility
- tracking/debug visibility is where trust is won or lost
- these are also the two surfaces most entangled with the executor contract

### Recommended decomposition pattern for Phase 1

Do not split by tiny presentational component first. Split by product responsibility.

Recommended initial boundaries:
- `FeedSurface`
- `ProfileSurface`
- `TrackingSurface`
- shared hooks/utilities for API state and formatter logic

Why:
- this reduces the risk of preserving the current monolith behind a shallow component shell
- it improves both demo polish and maintainability without triggering a full frontend rewrite

### Tracking UX requirement

The tracking page should continue to show raw evidence by default for now, but it needs a clearer hierarchy:

1. normalized run state and blocker summary
2. screenshot evidence
3. action trace
4. raw payloads

That matches the user’s requirement for one combined user/debug surface now, with a future split into user/admin roles later.

## Executor Contract Research

### Minimum contract needed now

The contract can stay loose in Phase 1, but it cannot stay implicit.

Every active executor path should normalize at least:
- `status`
- `currentStep`
- `needsInput`
- `requiresManualAttention`
- `blockingQuestion`
- `inputField`
- `lastError`
- `finalUrl`
- `actions`
- `snapshot`
- raw executor payload

### Why the loose contract is still enough for Phase 1

The repo is still in active tool exploration. Over-standardizing vendor payloads now would slow real progress.

What matters in Phase 1 is:
- shared app-visible outcome shape
- clear labeling of active vs experimental vs deprecated paths
- one obvious place where executor evidence is serialized for the UI

### Repo-clean implication

The following should be treated as dead or legacy unless the plan explicitly keeps them as experiments:
- `scripts/automation-worker.js` as a prior worker-generation artifact
- legacy `n8n` workflow files that do not reflect the current Stagehand path
- temporary Stagehand inspection files and profile artifacts under `tools/stagehand-runner/`

## Testing and Validation Research

The repo does not currently have a formal test harness.

Phase 1 should therefore introduce a minimal validation loop that supports brownfield stabilization without overcommitting to full end-to-end browser automation tests yet.

Recommended validation baseline:
- `npx tsc --noEmit`
- `npm run build`
- narrow route-level/manual validation around profile and automation-run detail endpoints
- a small first test harness for pure serialization logic in:
  - `lib/automation.ts`
  - `lib/automation-orchestrator.ts`

This is enough to support Phase 1 goals:
- stable profile/resume UX
- trustworthy tracking/debug serialization
- executor contract cleanup

It is not yet enough for Phase 2 ATS reliability, but that is acceptable.

## Validation Architecture

Phase 1 should add a lightweight automated feedback loop before significant UI and executor cleanup lands.

Recommended Wave 0:
- install `vitest` as the first lightweight test framework for pure TypeScript logic
- add at least one focused test file covering:
  - automation debug payload extraction and serialization
  - manual-attention / blocker normalization
- keep validation runtime under 30 seconds locally

Recommended sampling:
- after every task commit: run targeted `vitest` plus `npx tsc --noEmit`
- after every plan wave: run `npm run build`

Why `vitest` here:
- low setup cost in a Next/TypeScript repo
- enough for domain logic tests without forcing browser-test infrastructure into Phase 1
- good fit for serializer and contract code that currently lacks any safety net

## Phase 1 Planning Implications

### Plan 01-01 should focus on product-surface decomposition

It should:
- extract `Tracking` and `Profile/Resume` first
- preserve current behavior while reducing `app/page.tsx` responsibility
- refresh those surfaces visually enough for demo confidence

### Plan 01-02 should focus on tracking/debug hardening

It should:
- unify and normalize debug evidence presentation
- make screenshot, action trace, and blocker state first-class
- reduce duplication in automation serialization paths where practical

### Plan 01-03 should focus on executor and repo clarity

It should:
- label active, experimental, and deprecated automation paths
- delete obsolete artifacts
- stop runtime profile artifacts from polluting the repo
- document the supported executor/orchestrator contract in code-facing docs

## Recommended Phase 1 Position

- `Stagehand LOCAL + Playwright` should stay the active path
- `Browser Use` should remain the main experimental alternative
- `n8n` should stay optional transport/orchestration, not the browser brain
- cloud managed browser vendors should be deferred to later architecture work
- UI stabilization should focus first on profile and tracking, not the feed deck
- testing should begin with serializer/contract coverage, not full browser E2E

## Sources

### Primary
- Stagehand observe docs: `https://docs.stagehand.dev/v3/basics/observe`
- Stagehand model config docs: `https://docs.stagehand.dev/v3/configuration/models`
- Stagehand deterministic-agent docs: `https://docs.stagehand.dev/v3/best-practices/deterministic-agent`
- Playwright input actions docs: `https://playwright.dev/docs/input`
- Browser Use supported models docs: `https://docs.browser-use.com/open-source/supported-models`

### Public market references
- Simplify: `https://simplify.jobs/`
- AIApply: `https://aiapply.co/`
- LazyApply: `https://lazyapply.com/`

