---
phase: 01-stabilize-the-mvp-core
plan: 03
subsystem: infra
tags: [automation, stagehand, n8n, cleanup, docs]
requires: []
provides:
  - explicit active versus experimental versus deprecated executor contract
  - removal of dead n8n/browser worker artifacts
  - Stagehand WSL cleanup for repo-local browser profile pollution
affects: [phase-01, phase-02, automation, orchestration]
tech-stack:
  added: []
  patterns:
    - executor paths must be labeled in docs before they are treated as supported
    - Stagehand runner performs post-run cleanup for WSL profile artifacts
key-files:
  created:
    - docs/automation-execution.md
  modified:
    - tools/stagehand-runner/server.mjs
    - .gitignore
    - package.json
    - n8n/job-apply-stagehand-orchestrator.workflow.json
  removed:
    - n8n/job-apply-anchor-orchestrator.workflow.json
    - n8n/job-apply-ai-agent.workflow.json
    - n8n/job-apply-browserbase-orchestrator.workflow.json
    - n8n/browserbase-apply-tool.workflow.json
    - n8n/skyvern-apply-tool.workflow.json
    - scripts/automation-worker.js
    - docs/n8n-ai-agent-workflow.md
    - docs/n8n-automation-orchestrator.md
key-decisions:
  - "Stagehand LOCAL + Playwright remains the only active execution path in Phase 1."
  - "Browser Use is documented as the main experimental alternative, not a supported runtime."
  - "Dead managed-browser experiments were deleted instead of left as apparent options."
patterns-established:
  - "Execution contract pattern: app is source of truth, n8n is transport, executor returns normalized run evidence."
  - "Runtime hygiene pattern: WSL profile artifacts are cleaned by the runner rather than hidden behind broad ignores."
requirements-completed: [DISC-03, TRAK-03]
duration: 1h
completed: 2026-03-17
---

# Phase 1 Plan 03 Summary

**The automation surface now points to a single supported Stagehand path, with dead vendor experiments removed and WSL profile pollution cleaned up by the runner**

## Performance

- **Duration:** ~1h
- **Completed:** 2026-03-17
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added `docs/automation-execution.md` as the single Phase 1 source of truth for active, experimental, and deprecated execution paths.
- Removed obsolete Anchor, Browserbase, Skyvern, and AI-agent workflow artifacts plus the legacy local worker entrypoint.
- Hardened `tools/stagehand-runner/server.mjs` so WSL-generated repo-local browser profile artifacts are cleaned before and after runs.

## Files Created/Modified

- `docs/automation-execution.md` - supported executor contract and path labels.
- `tools/stagehand-runner/server.mjs` - temp profile directory handling and WSL artifact cleanup.
- `.gitignore` - narrowed Stagehand scratch ignores.
- `package.json` - removed the obsolete `automation:worker` script.

## Decisions Made

- Deleted dead automation artifacts instead of archiving executable files that no longer reflect the product.
- Kept only the Stagehand orchestrator workflow as the supported `n8n` path.
- Treated WSL profile cleanup as a runtime responsibility, not a `.gitignore` band-aid.

## Deviations from Plan

- Deleted additional dead Browserbase and Skyvern workflow files beyond the minimum listed in the plan because they were equally misleading as runtime options.

## Issues Encountered

- Stagehand under WSL still created UNC-style profile directories inside the repo even with an explicit temp `userDataDir`.
- Fixed by adding targeted cleanup of those WSL artifact directories around each run and verifying the patched runner on a temporary port.

## User Setup Required

None.

## Next Phase Readiness

- The repo now has one obvious supported execution path for the remaining Phase 1 tracking/debug work.
- Phase 2 can evaluate Browser Use without inheriting the old Anchor/Browserbase runtime clutter.

