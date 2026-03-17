# Phase 1: Stabilize the MVP Core - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the current brownfield prototype into a coherent product foundation with clean run visibility and a stable executor boundary. This phase is about stabilizing and clarifying what already exists, not adding new product capabilities or broadening ATS support.

</domain>

<decisions>
## Implementation Decisions

### UI split
- Phase 1 UI work should balance investor-demo polish with developer maintainability.
- Extract `Tracking` and `Profile/Resume` surfaces first because they are the highest-risk and highest-leverage parts of the current UI.
- The extraction should be moderate in scope: real component/section decomposition and some shared helper cleanup, but not a full frontend rewrite.
- Refresh the extracted surfaces visually in this phase, but do not let that become a full-product redesign.

### Tracking depth
- Tracking should serve both user clarity and debugging convenience in one place for now.
- The long-term direction is to split this into role-based views (user/admin), but not in Phase 1.
- Failed or blocked runs must show: status, blocker, screenshot, and action trace.
- Raw debug data should be visible by default in the current MVP.
- Status model should distinguish:
  - `Needs input` for job-relevant user questions
  - `Manual attention` for technical or human-check boundaries
  - `Failed` for real execution failures

### Executor contract
- The supported automation philosophy is hybrid by design.
- AI should play a significant role in understanding page sections, finding entry points, and interpreting ambiguous fields/questions.
- Deterministic browser control should handle actual field fill, resume upload, and final submit/verification.
- Phase 1 should keep a loose shared executor contract: normalize status, blocker, action trace, screenshot, and final URL, but do not over-standardize vendor-specific debug payloads yet.
- Multiple execution paths may coexist during Phase 1, but they must be explicitly labeled as active, experimental, or deprecated.
- Research into browser-execution tooling is a first-class workstream in this phase.

### Cleanup boundary
- Phase 1 should reach engineering-clean, not deep-clean perfection.
- Clearly obsolete automation/workflow paths should be deleted, not merely documented.
- Local runtime artifacts and noisy temp state should be cleaned up enough to stop worktree pollution, but without overinvesting.
- If cleanup conflicts with core automation momentum, automation work wins after the minimum clarity-preserving cleanup is done.

### Claude's Discretion
- Exact component boundaries for extracted UI modules.
- Exact presentation of visible raw debug data, as long as summary information remains readable.
- Exact labeling scheme for active/experimental/deprecated automation paths.
- Exact cleanup sequence, as long as obsolete paths are removed and the main supported path becomes obvious.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and scope
- `.planning/PROJECT.md` — Product promise, constraints, and non-negotiable MVP direction.
- `.planning/REQUIREMENTS.md` — Phase 1 requirement coverage and traceability.
- `.planning/ROADMAP.md` — Fixed Phase 1 boundary, goal, and success criteria.
- `.planning/STATE.md` — Current focus, blockers, and session continuity.

### Existing codebase understanding
- `.planning/codebase/ARCHITECTURE.md` — Current system shape, active automation path, and architectural tensions.
- `.planning/codebase/CONCERNS.md` — Known risk areas, especially UI monolith, automation churn, and runtime noise.
- `.planning/codebase/STRUCTURE.md` — Current file layout and where legacy/experimental assets live.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/page.tsx` — Contains the current feed, profile, tracking, and dev-tool surfaces that need decomposition.
- `lib/automation.ts` — Existing automation run serialization and debug-summary folding.
- `lib/automation-orchestrator.ts` — Current orchestrator contract and callback normalization.
- `tools/stagehand-runner/server.mjs` — Current local executor with snapshot and action-trace support.
- `app/api/automation-runs/[id]/route.ts` and related automation routes — existing API surface for tracking and orchestration.

### Established Patterns
- The app remains the source of truth for automation state; orchestrators and executors report back into app-owned run/event records.
- Debug payloads are already surfaced into the UI directly, which supports the Phase 1 decision to keep raw debug visible.
- The current browser strategy is already hybrid in practice: Stagehand for reasoning, Playwright for deterministic interaction.

### Integration Points
- Tracking extraction should continue consuming the existing automation run detail endpoints rather than inventing a second debug pipeline.
- Profile/resume extraction must remain compatible with `app/api/profile/route.ts` and `app/api/resume/parse/route.ts`.
- Executor-contract cleanup should center on the handoff between `lib/automation-orchestrator.ts`, `n8n/`, and `tools/stagehand-runner/server.mjs`.

</code_context>

<specifics>
## Specific Ideas

- Keep both user-facing clarity and operator debugging in the same tracking surface for now.
- The screenshot shown for failures should be genuinely useful and try to include relevant required fields/state, not just any terminal image.
- Browser-tooling research should aggressively evaluate the strongest options because this is the heart of the app.
- Public analysis of adjacent or competitor products is worthwhile if it helps understand how similar products structure browser automation.

</specifics>

<deferred>
## Deferred Ideas

- Future role-based split between user-facing and admin/operator tracking tools.
- Broader competitor/adjacent implementation intelligence can evolve into a recurring research track beyond this phase.
- Broader ATS expansion remains outside Phase 1 and belongs in later roadmap phases.

</deferred>

---
*Phase: 01-stabilize-the-mvp-core*
*Context gathered: 2026-03-17*
