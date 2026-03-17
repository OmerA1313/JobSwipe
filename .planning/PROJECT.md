# Job Swipe

## What This Is

Job Swipe is a Tinder-like job discovery and application product for software job seekers. It combines swipe-based job discovery, AI-assisted resume tailoring, and automated application flows so a user can move from discovery to application with minimal manual input. The current codebase is a brownfield MVP with real ingestion, ranking, tracking, and early ATS automation experiments.

## Core Value

A user can discover relevant jobs quickly and submit high-quality applications across supported ATS systems with minimal manual effort.

## Requirements

### Validated

- ✓ Ingest jobs from multiple external sources and persist them locally — existing
- ✓ Rank jobs against a stored user profile and present them as a swipe feed — existing
- ✓ Let a user save profile data, resume text, and resume PDF for downstream apply flows — existing
- ✓ Track application attempts and automation runs with detailed run/event history — existing
- ✓ Run at least one browser automation path against supported ATS families with local-first tooling — existing prototype capability

### Active

- [ ] Support a small set of ATS families with reliable end-to-end auto-apply flows suitable for MVP demos
- [ ] Tailor resumes and application context with AI in a way that improves quality without creating heavy operating cost
- [ ] Minimize user interruption so the user is only asked about job-relevant questions and decisions, not browser mechanics
- [ ] Research and choose a stable browser automation architecture that can scale from local MVP constraints to a future paid production stack
- [ ] Handle hostile job-application flows more smoothly, including human-check barriers, while preserving a clean user experience
- [ ] Produce an investor-demo-ready MVP that shows real job discovery, application automation, and tracking in one coherent product

### Out of Scope

- A universal guarantee that any arbitrary job site can be fully auto-applied today — unrealistic for MVP scope and current automation reliability
- Optimizing for lowest-possible model quality or brittle cheap tooling — reliability matters more than shaving the last dollar off local experimentation
- Requiring users to understand browser automation internals, workflow tooling, or provider-specific setup — product value depends on hiding that complexity

## Context

The current codebase already contains a functioning brownfield base: Next.js frontend, Prisma/SQLite persistence, multi-source job ingestion, profile/resume management, matching, application tracking, and several generations of automation experiments. Recent work indicates the most credible low-cost path is local-first automation using a hybrid of AI reasoning and deterministic browser actions rather than depending entirely on paid managed browser agents. The project goal is not an internal automation toy; it is an MVP that can be shown to investors and plausibly shipped as a real product. The biggest current open question is how to achieve stable application automation across multiple ATS families, including smoother handling of human-verification barriers, while keeping costs close to zero during MVP development.

## Constraints

- **Budget**: Costs should stay close to zero during MVP development — local-first tools and self-hosted models are preferred initially
- **Product**: MVP must be strong enough to demo to investors — polish and reliability matter more than broad but flaky coverage
- **Automation UX**: User intervention should be minimized — users should only be involved for job-relevant decisions or missing answers
- **Architecture**: Tooling should stay reasonably consistent over time — avoid a throwaway stack that must be entirely replaced once paid tools are introduced
- **Domain Reality**: ATS and job boards are hostile, inconsistent, and anti-bot-sensitive — architecture must account for instability as a first-class concern
- **Scope**: v1 should support a few ATS families reliably rather than promise universal support prematurely

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build an investor-demoable brownfield MVP instead of a research-only prototype | The near-term objective is something that can be shown and potentially shipped | — Pending |
| Target a few ATS families first rather than universal site coverage | A small set of stable flows is more credible and more achievable than “apply anywhere” | — Pending |
| Prefer local-first, low-cost automation and model infrastructure during MVP development | The project is cost-sensitive and should not depend on expensive recurring browser or model services yet | — Pending |
| Minimize user interruption and hide browser/tooling complexity from the user | The product promise is convenience, not exposing automation internals | — Pending |
| Push toward bypassing or smoothing hostile automation barriers rather than designing around manual technical intervention | The intended user experience is a near-hands-off apply flow except for job-relevant input | — Pending |

---
*Last updated: 2026-03-17 after initialization*
