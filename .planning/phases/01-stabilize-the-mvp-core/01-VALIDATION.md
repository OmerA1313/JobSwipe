---
phase: 01
slug: stabilize-the-mvp-core
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-17
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` for Phase 1 domain tests + existing TypeScript/Next build checks |
| **Config file** | `none — Wave 0 installs and adds config if needed` |
| **Quick run command** | `npx vitest run <target> && npx tsc --noEmit` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <target> && npx tsc --noEmit`
- **After every plan wave:** Run `npm run build`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | DISC-01 | build/type | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01-01 | 1 | PROF-01 | build/type | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 01-02-01 | 01-02 | 1 | TRAK-02 | unit | `npx vitest run automation` | ❌ W0 | ⬜ pending |
| 01-02-02 | 01-02 | 1 | TRAK-03 | unit | `npx vitest run automation` | ❌ W0 | ⬜ pending |
| 01-03-01 | 01-03 | 2 | TRAK-01 | build/type | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` added to `devDependencies`
- [ ] `vitest.config.*` or package-script-based minimal config created if required
- [ ] `tests/automation.serialization.test.ts` — covers debug extraction and normalized status behavior
- [ ] `package.json` contains a stable test command for Phase 1 validation

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Profile/resume form still works after extraction | PROF-01, PROF-02, PROF-03 | Current UI is client-heavy and has no browser harness yet | Update profile fields, upload a PDF resume, refresh the page, confirm values persist and the UI reflects stored resume state |
| Tracking screen shows blocker, screenshot, and action trace clearly | TRAK-01, TRAK-02 | Requires visual verification and evidence readability judgment | Trigger or inspect a blocked run, confirm the normalized status is visible first, then screenshot and action trace appear without digging into raw JSON |
| Active vs experimental automation path labeling is obvious in the repo/UI/docs | TRAK-03 | Repo and local tooling state cannot be fully asserted by unit tests | Inspect the active workflow/runner docs and relevant UI/dev surfaces, confirm the supported path is explicit and obsolete paths are removed or labeled |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
