# Requirements: Job Swipe

**Defined:** 2026-03-17
**Core Value:** A user can discover relevant jobs quickly and submit high-quality applications across supported ATS systems with minimal manual effort.

## v1 Requirements

### Discovery

- [ ] **DISC-01**: User can browse a swipe-based feed of ranked jobs relevant to their profile.
- [ ] **DISC-02**: User can filter or scope the feed by supported source/ATS family.
- [ ] **DISC-03**: User can refresh the job pool from external sources without breaking existing profile or tracking state.

### Profile & Resume

- [ ] **PROF-01**: User can save profile basics needed for applications, including name, email, and phone.
- [ ] **PROF-02**: User can upload and persist a PDF resume for downstream auto-apply flows.
- [ ] **PROF-03**: User can store target-role, location, remote, and seniority preferences that influence matching.

### Application Quality

- [ ] **QUAL-01**: System can produce cleaner AI-assisted job summaries that improve job-card readability.
- [ ] **QUAL-02**: System can generate or tailor job-specific application content from the user profile and target job.
- [ ] **QUAL-03**: User is only interrupted for job-relevant questions or decisions, not browser/tooling mechanics.

### Automation Engine

- [ ] **AUTO-01**: System can create, dispatch, and track automation runs for supported ATS families.
- [ ] **AUTO-02**: System can reliably complete end-to-end application flows for a small set of ATS families.
- [ ] **AUTO-03**: System can fill core application fields and upload the user’s PDF resume on supported flows.
- [ ] **AUTO-04**: System can detect and surface blockers with normalized user-facing explanations.
- [ ] **AUTO-05**: System can preserve enough debug evidence per run to diagnose failures without guessing.

### Tracking & Operations

- [ ] **TRAK-01**: User can view the current and historical status of each automation run.
- [ ] **TRAK-02**: Tracking UI shows the latest blocker, debug events, and snapshot evidence for failed or paused runs.
- [ ] **TRAK-03**: System records applications and automation outcomes separately so the user can distinguish submitted, failed, and manual-attention states.

## v2 Requirements

### Automation Expansion

- **AUTO-06**: System supports a broader set of ATS families beyond the initial MVP set.
- **AUTO-07**: System supports authenticated job-board flows using user-authorized sessions where legally and operationally appropriate.
- **AUTO-08**: System can switch browser infrastructure providers without rewriting product state management.

### Product Expansion

- **PROD-01**: Team/admin users can inspect fleet-level automation performance and failure patterns.
- **PROD-02**: System supports more advanced tailored resume and cover-letter generation workflows.
- **PROD-03**: System supports broader collaboration, analytics, and growth workflows for a shipped product.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Guaranteed “apply to any job site” coverage in v1 | Not credible at MVP stage and incompatible with reliable execution |
| A product promise built around CAPTCHA bypass | Too unstable and risky to define the MVP around |
| Native mobile apps | Web product is sufficient for MVP |
| Full multi-tenant admin platform | Not required for investor-demo stage |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 1 | Pending |
| DISC-02 | Phase 1 | Pending |
| DISC-03 | Phase 1 | Pending |
| PROF-01 | Phase 1 | Pending |
| PROF-02 | Phase 1 | Pending |
| PROF-03 | Phase 1 | Pending |
| TRAK-01 | Phase 1 | Pending |
| TRAK-02 | Phase 1 | Pending |
| TRAK-03 | Phase 1 | Pending |
| AUTO-01 | Phase 2 | Pending |
| AUTO-02 | Phase 2 | Pending |
| AUTO-03 | Phase 2 | Pending |
| AUTO-04 | Phase 2 | Pending |
| AUTO-05 | Phase 2 | Pending |
| QUAL-01 | Phase 3 | Pending |
| QUAL-02 | Phase 3 | Pending |
| QUAL-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after initialization*
