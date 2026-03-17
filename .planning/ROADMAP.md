# Roadmap: Job Swipe

## Overview

This roadmap turns the current brownfield MVP into an investor-demoable product with a credible path to shipping. The sequence is deliberate: first stabilize the existing app and automation boundary, then make supported ATS automation reliably work, then improve application quality and user experience, and only then harden the demo and future-scale path.

## Phases

- [ ] **Phase 1: Stabilize the MVP Core** - Clean the existing codebase, productize run visibility, and lock the automation contract.
- [ ] **Phase 2: Ship Reliable Supported ATS Automation** - Make a few ATS families complete end-to-end application flows reliably.
- [ ] **Phase 3: Improve Application Quality and User Context** - Add stronger tailoring and minimize non-job-related user interruption.
- [ ] **Phase 4: Demo Hardening and Growth-Ready Architecture** - Polish the product for investor demos and prepare the execution layer for future paid infrastructure.

## Phase Details

### Phase 1: Stabilize the MVP Core
**Goal**: Turn the current brownfield prototype into a coherent product foundation with clean run visibility and a stable executor boundary.  
**Depends on**: Nothing (first phase)  
**Requirements**: DISC-01, DISC-02, DISC-03, PROF-01, PROF-02, PROF-03, TRAK-01, TRAK-02, TRAK-03  
**Success Criteria** (what must be TRUE):
  1. User can set up profile, resume, and preferences without broken flows.
  2. Tracking clearly shows what happened in each automation run, including blocker reason and evidence.
  3. The browser executor has a clear internal contract that does not depend on a specific vendor experiment.
  4. Core UI surfaces are stable enough for repeated demo use.
**Plans**: 3 plans

Plans:
- [ ] 01-01: Split and clean the current product surface around feed, profile, and tracking responsibilities.
- [ ] 01-02: Harden automation event, snapshot, and debug serialization through the app.
- [ ] 01-03: Remove dead-path workflow clutter and define the supported executor/orchestrator contract.

### Phase 2: Ship Reliable Supported ATS Automation
**Goal**: Deliver end-to-end auto-apply reliability for a small, named set of ATS families.  
**Depends on**: Phase 1  
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05  
**Success Criteria** (what must be TRUE):
  1. At least a few ATS families can complete core apply flows end-to-end on repeatable test cases.
  2. Resume upload, required-field fill, and submit confirmation work on supported families.
  3. Failures are normalized into clear blocker categories instead of vague executor statuses.
  4. Unsupported or hostile flows fail honestly without corrupting run state.
**Plans**: 3 plans

Plans:
- [ ] 02-01: Formalize ATS-family adapters and supported-site boundaries.
- [ ] 02-02: Refine the Stagehand + Playwright hybrid executor for supported ATS families.
- [ ] 02-03: Build reusable blocker handling, answer memory, and manual-attention handoff.

### Phase 3: Improve Application Quality and User Context
**Goal**: Make the product improve application quality, not just automate clicks.  
**Depends on**: Phase 2  
**Requirements**: QUAL-01, QUAL-02, QUAL-03  
**Success Criteria** (what must be TRUE):
  1. Job cards and job detail summaries are materially cleaner and more useful than raw listings.
  2. Tailored application content is generated from real user/job context and integrates cleanly into apply flows.
  3. The user is interrupted only for missing job-relevant information or explicit decisions.
**Plans**: 2 plans

Plans:
- [ ] 03-01: Strengthen AI-assisted summaries and tailoring outputs with quality controls.
- [ ] 03-02: Add reusable question interpretation and answer-memory flows across runs.

### Phase 4: Demo Hardening and Growth-Ready Architecture
**Goal**: Produce a polished investor-demo flow and a credible next-step architecture for scaling automation.  
**Depends on**: Phase 3  
**Requirements**: Supports all v1 requirements in a demo-ready product; prepares v2 automation expansion requirements  
**Success Criteria** (what must be TRUE):
  1. The MVP can be demonstrated end-to-end on supported ATS flows without fragile operator workarounds.
  2. The product’s support boundary is explicit and credible to external audiences.
  3. The executor can later adopt paid browser infrastructure without rewriting the product state model.
**Plans**: 2 plans

Plans:
- [ ] 04-01: Harden demo paths, messaging, and operator tooling for investor-facing reliability.
- [ ] 04-02: Define the migration path from local-first execution to future paid browser infrastructure.

## Progress

**Execution Order:**  
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Stabilize the MVP Core | 0/3 | Not started | - |
| 2. Ship Reliable Supported ATS Automation | 0/3 | Not started | - |
| 3. Improve Application Quality and User Context | 0/2 | Not started | - |
| 4. Demo Hardening and Growth-Ready Architecture | 0/2 | Not started | - |
