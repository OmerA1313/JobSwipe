# Project Research Summary

**Project:** Job Swipe
**Domain:** AI-assisted job discovery and ATS automation
**Researched:** 2026-03-17
**Confidence:** MEDIUM

## Executive Summary

Job Swipe should not be planned as a “magically auto-apply to any site” product. The most defensible MVP is a swipe-based job discovery app with AI-assisted tailoring and highly reliable automation on a small set of ATS families. The browser-automation layer should be hybrid: AI to enter the flow and interpret layout variation, deterministic browser actions for form fill, resume upload, and submit verification.

The current codebase already has the right product skeleton: multi-source ingestion, profile/resume storage, swipe UI, application tracking, and a local Stagehand executor path. The main gap is not basic app functionality; it is productizing the automation engine into something reproducible, observable, and honest about its support boundaries.

The highest-risk trap is building the roadmap around CAPTCHA bypass or a universal-site promise. For the MVP, the correct strategy is supported ATS-family coverage, deep tracking/debug visibility, and a stable executor contract that can later upgrade from local infrastructure to paid browser infrastructure without a product rewrite.

## Key Findings

### Recommended Stack

The strongest near-term stack is the one closest to what the codebase already does well:
- Keep the Next.js + Prisma app intact as the product surface and system of record.
- Keep Playwright as the deterministic engine for critical browser actions.
- Keep Stagehand in local mode for page reasoning, form-entry discovery, and ambiguous field interpretation.
- Keep Ollama/local models for low-cost experimentation, but constrain their responsibility.

**Core technologies:**
- Next.js: product UI/API surface — already in place and adequate for MVP iteration
- Playwright: browser execution and file upload — most reliable primitive for ATS forms
- Stagehand LOCAL: AI-assisted navigation and action discovery — bridges page variability without handing over the whole flow
- Prisma + SQLite: MVP persistence — sufficient for current scale

### Expected Features

**Must have (table stakes):**
- Relevant job discovery and filtering
- Resume/profile storage
- Reliable ATS automation for supported families
- Tracking with blocker visibility and evidence

**Should have (competitive):**
- Swipe-first job discovery
- AI-assisted resume tailoring
- Low-friction apply loop with minimal user interruption

**Defer (v2+):**
- Broad “any site” automation promise
- Large-scale stealth/browser-infrastructure dependency
- Deep admin analytics and enterprise-grade multi-user operations

### Architecture Approach

The right architecture is app-owned orchestration plus a swappable browser executor. The browser executor should be hybrid: AI for navigation/discovery, deterministic code for fill/upload/submit. `n8n` should stay optional and deterministic; it is not the browser brain.

**Major components:**
1. Discovery engine — ingest, normalize, and rank jobs
2. Application context layer — profile, resume, tailoring, reusable answers
3. Automation engine — ATS-family adapters plus browser executor
4. Tracking/debug layer — event log, snapshots, blocker normalization

### Critical Pitfalls

1. **Planning around CAPTCHA bypass** — scope the MVP around supported ATS families instead
2. **Using a pure agent for final submission** — keep deterministic last-mile browser actions
3. **Provider churn without a stable contract** — preserve a clean internal executor boundary
4. **Weak run visibility** — keep snapshots, action traces, and blocker evidence first-class
5. **Frontend monolith growth** — split the UI before the demo surface becomes too fragile

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Productize the current base
**Rationale:** The app already has real product surface area. Stabilize it before expanding automation claims.  
**Delivers:** Clear product boundaries, cleaned architecture, better tracking/debugging, and a committed executor contract.  
**Addresses:** Reliability, UI structure, and execution visibility.  
**Avoids:** Tool churn and demo fragility.

### Phase 2: Reliable supported-site automation
**Rationale:** Product value depends on actually completing applications on a few ATS families.  
**Delivers:** Strong end-to-end flows for selected ATS families with deterministic submit behavior.  
**Uses:** Stagehand + Playwright hybrid approach.  
**Implements:** ATS adapters and reusable answer handling.

### Phase 3: Tailoring and user-quality loop
**Rationale:** Auto-apply without quality support becomes a volume gimmick.  
**Delivers:** AI-assisted resume tailoring, stronger application context, and job-relevant user questions only.  
**Implements:** Differentiation beyond simple automation.

### Phase 4: Demo hardening and growth-ready architecture
**Rationale:** Investor demo quality requires polished behavior, clear scope, and believable scale-up path.  
**Delivers:** Polished investor-demo flow, improved observability, and a clear future path to paid browser infrastructure if justified.  
**Avoids:** Premature universal-site claims.

### Phase Ordering Rationale

- The current product already exists in prototype form, so the first milestone is stabilization, not greenfield setup.
- ATS-family support must come before broader product claims.
- AI tailoring should follow a working application engine, not compensate for a broken one.
- Paid stealth/browser infrastructure should only enter once the local-first path proves product value.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Exact ATS-family boundaries, adapter strategy, and blocker normalization
- **Phase 4:** When to adopt paid browser infrastructure and what compliance posture is acceptable

Phases with standard patterns:
- **Phase 1:** App decomposition, event debugging, and contract cleanup are standard engineering work
- **Phase 3:** Tailoring and reusable-answer flows are product-layer work on top of stable infrastructure

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core browser/control primitives are well-supported by official docs |
| Features | MEDIUM | Product feature shape is clear, but investor-demo prioritization still needs discipline |
| Architecture | HIGH | Hybrid executor + app-owned state is the most coherent fit for this repo |
| Pitfalls | HIGH | Most major risks are already visible in the current codebase and experiments |

**Overall confidence:** MEDIUM

### Gaps to Address

- Exact MVP ATS-family list should be formalized early in Phase 2.
- The roadmap must explicitly avoid promising universal hostile-site automation in v1.
- Long-term path for hostile human checks remains a business and compliance problem, not only a technical one.

## Sources

### Primary (HIGH confidence)
- Stagehand browser/model/act/observe/deterministic-agent docs:
  - https://docs.stagehand.dev/v3/configuration/browser
  - https://docs.stagehand.dev/v3/configuration/models
  - https://docs.stagehand.dev/v3/basics/act
  - https://docs.stagehand.dev/v3/basics/observe
  - https://docs.stagehand.dev/v3/best-practices/deterministic-agent
- Playwright input and upload docs:
  - https://playwright.dev/docs/input

### Secondary (MEDIUM confidence)
- Browser Use docs:
  - https://docs.browser-use.com/open-source/supported-models
  - https://docs.browser-use.com/cloud/tips/integrations/playwright
  - https://docs.browser-use.com/cloud/tips/integrations/n8n
- Skyvern self-hosted LLM config docs:
  - https://docs-new.skyvern.com/self-hosted/llm-configuration

### Tertiary / Future comparison
- Browserbase stealth/signed-agent docs:
  - https://docs.browserbase.com/features/stealth-mode

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
