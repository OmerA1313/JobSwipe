# Architecture Research

**Domain:** AI-assisted job discovery and ATS automation
**Researched:** 2026-03-17
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Product UI / API Layer                   │
├─────────────────────────────────────────────────────────────┤
│  Swipe Feed   Profile   Tracking   Dev/Admin   Apply APIs   │
├─────────────────────────────────────────────────────────────┤
│               Matching / Tailoring / Orchestration          │
├─────────────────────────────────────────────────────────────┤
│   Job Ingest   ATS Router   Run State   Event/Snapshot Log  │
├─────────────────────────────────────────────────────────────┤
│                  Browser Execution Layer                    │
├─────────────────────────────────────────────────────────────┤
│ AI Page Reasoning │ Deterministic Fill/Upload │ Handoffs    │
├─────────────────────────────────────────────────────────────┤
│                    Persistence / Artifacts                  │
│ SQLite / Prisma │ Resume blobs │ Run events │ screenshots   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Discovery app | Job feed, profile editing, tracking, user decisions | Next.js app with server routes and client UI |
| Ingestion layer | Pull and normalize jobs from multiple sources | Source adapters with per-source parsing and scoring |
| Automation orchestrator | Queue runs, call executor, store results | App-owned run state with optional n8n workflow control |
| Browser executor | Navigate forms, upload files, submit, capture blockers | Hybrid Stagehand/Playwright executor |
| ATS adapters | Family-specific heuristics and flow boundaries | One adapter per ATS family, not per company |

## Recommended Project Structure

```text
app/
├── page.tsx                 # Current main UI surface
├── api/                     # Product API routes

lib/
├── job-sources/             # Source adapters
├── matching.ts              # Ranking and signals
├── automation.ts            # Run lifecycle
├── automation-orchestrator.ts
├── apply.ts                 # Manual apply helpers
└── job-summary-*.ts         # AI summarization

tools/
└── stagehand-runner/        # Local browser execution service

n8n/
└── *.workflow.json          # Optional orchestration definitions
```

### Structure Rationale

- **App-owned state:** the product database remains the source of truth even if orchestration is delegated.
- **Executor isolation:** browser automation should stay in a separable service/runtime so it can evolve without destabilizing the product UI.
- **ATS-family boundaries:** stable, testable adapters belong between generic orchestration and raw browser steps.

## Architectural Patterns

### Pattern 1: Hybrid navigation + deterministic submit

**What:** Use AI to discover the right entry points and interpret ambiguous page structure, then switch to deterministic Playwright actions for critical fields, file upload, and submit confirmation.  
**When to use:** Job application flows with repeatable families like Comeet, Lever, and Greenhouse.  
**Trade-offs:** More engineering than a pure agent; far more controllable and debuggable.

### Pattern 2: Event-sourced automation debugging

**What:** Persist every run transition and debug payload as events, then derive UI-friendly debug summaries.  
**When to use:** Any automation system where failures are common and investigation matters.  
**Trade-offs:** Slightly more plumbing; dramatically better operator visibility.

### Pattern 3: Infrastructure-swappable browser layer

**What:** Keep the executor contract stable while allowing the browser runtime to move from local to cloud.  
**When to use:** MVP starts local but may later need stealth or managed infrastructure.  
**Trade-offs:** Requires a clean contract boundary; avoids rewriting the app when infra changes.

## Data Flow

### Request Flow

```text
User swipes right / clicks Apply
    ↓
AutomationRun created
    ↓
Orchestrator dispatches run
    ↓
Browser executor starts
    ↓
Executor emits events / snapshots / blocker payloads
    ↓
Run state updated in app DB
    ↓
Tracking UI renders current outcome
```

### Key Data Flows

1. **Discovery flow:** source adapters ingest jobs → DB → ranking → swipe feed.
2. **Application flow:** user action → automation run → executor → events/debug → tracking/application record.
3. **Tailoring flow:** job + profile context → AI summarization/tailoring → card/apply artifacts.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Keep monolithic app + local or single-host executor |
| 1k-100k users | Split executor from app, move binary artifacts out of SQLite, add job queues |
| 100k+ users | Separate ingestion, orchestration, and browser fleets; formal observability and distributed queues |

### Scaling Priorities

1. **First bottleneck:** browser execution stability and throughput, not feed rendering.
2. **Second bottleneck:** artifact storage and operator visibility for failed runs.

## Anti-Patterns

### Anti-Pattern 1: Pure autonomous agent as the whole stack

**What people do:** Ask a single browser agent to handle all browsing, interpretation, filling, uploading, and submission.  
**Why it's wrong:** It is expensive, opaque, and unreliable on critical submission steps.  
**Do this instead:** Use agents for discovery/reasoning and deterministic actions for the fragile last mile.

### Anti-Pattern 2: Hardcoding every company site

**What people do:** Write one-off selectors for individual companies or listings.  
**Why it's wrong:** Maintenance explodes and reuse collapses.  
**Do this instead:** Build ATS-family adapters and shared heuristics.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Ollama | Local model endpoint | Good for cheap local experimentation, but model quality should be used selectively |
| Future stealth browser provider | Swappable executor backend | Consider only after the ATS-family approach proves product value |
| n8n | Optional orchestration | Use for retries and workflow control, not primary browser logic |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| App ↔ Orchestrator | HTTP/webhook contract | Keep app as source of truth |
| Orchestrator ↔ Executor | Structured JSON request/response | Must include run id, profile context, debug output |
| Executor ↔ UI | Event/debug serialization through DB | Avoid direct UI coupling to raw tool vendors |

## Sources

- Current repo structure and codebase map in `.planning/codebase/`
- Stagehand docs on local mode, Playwright page integration, and observe/act usage: https://docs.stagehand.dev/v3/configuration/browser, https://docs.stagehand.dev/v3/basics/act, https://docs.stagehand.dev/v3/basics/observe
- Browser Use direct browser / CDP docs: https://docs.browser-use.com/cloud/tips/integrations/playwright
- Playwright docs for form interaction and file upload: https://playwright.dev/docs/input

---
*Architecture research for: AI-assisted job discovery and ATS automation*
*Researched: 2026-03-17*
