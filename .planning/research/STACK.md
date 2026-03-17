# Stack Research

**Domain:** AI-assisted job discovery and ATS automation
**Researched:** 2026-03-17
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15.x | Product UI and backend API surface | Already in place, good enough for MVP velocity, and keeps app + API + admin/debug UI in one deployable surface |
| Prisma + SQLite | Prisma 5.x / SQLite | Local persistence for MVP state | Already in place, cheap, simple, and sufficient for investor-demo scale |
| Playwright | 1.58+ | Deterministic browser interaction | Officially supports robust filling, selection, clicking, and file upload APIs; best foundation for ATS-family adapters |
| Stagehand | 3.x | AI-assisted browser action discovery and page reasoning | Supports local execution, local browser mode, local/custom models, and direct use with Playwright pages |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Ollama | current local runtime | Local model serving | Use during MVP development to keep experimentation costs near zero |
| pdf-parse | current | Resume text extraction | Keep for existing profile/resume ingestion flow |
| n8n | local instance | Optional workflow orchestration | Use for retries, callbacks, and operator workflows, but not as the browser-execution engine |
| Browser Use Cloud / SDK | current cloud offering | Future stealth browser infrastructure and task execution | Use later if local Stagehand + Playwright is not sufficient for production-grade browser reliability |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript strict mode | Type safety | Already enabled and should stay enabled |
| Local Chromium via Playwright | Browser runtime | Keep explicit local browser control for reliable form filling and resume upload |
| Snapshot/event logging | Executor debugging | Keep terminal screenshots, action logs, and raw payloads surfaced into the tracking UI |

## Installation

```bash
# Core app/runtime
npm install next react react-dom @prisma/client openai pdf-parse

# Browser execution
npm install -D playwright
npm install @browserbasehq/stagehand

# Local AI runtime
ollama serve
ollama pull qwen2.5:7b
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Stagehand LOCAL + Playwright | Browser Use open-source + Ollama | Strong option if the team is willing to add a Python runtime and wants deeper investment in a dedicated browser-agent stack |
| Deterministic Playwright for critical submit/upload paths | Pure agentic browser execution | Only use pure agents for exploration or unsupported-edge recovery; it is too unstable as the primary submit path |
| Local-first stack | Browserbase cloud / stealth stack | Use later when budget exists and stealth / signed-agent / managed browser infrastructure becomes worth paying for |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| “Universal auto-apply” as an MVP promise | Product claim exceeds current browser and anti-bot reality | Promise reliable support for selected ATS families first |
| Pure AI-agent browser execution for full apply flows | Slow, non-deterministic, and weak on repeatability for resume upload and final submit | Hybrid approach: AI for discovery/navigation, Playwright for critical actions |
| CAPTCHA bypass as a core architecture assumption | Fragile, expensive, and legally/commercially risky | Design around supported ATS flows, user-authorized sessions, and explicit human handoff for hostile checks |

## Stack Patterns by Variant

**If the target site family is stable and form-heavy:**
- Use deterministic Playwright for fill/upload/submit.
- Use Stagehand only to enter the form, identify ambiguous fields, and recover from layout variation.

**If the target site is visually inconsistent but still worth supporting:**
- Use Stagehand to observe and plan actions first.
- Cache or convert successful paths into deterministic scripts where possible.

**If production eventually needs stealth infrastructure:**
- Keep the same high-level architecture, but swap local browser execution for a cloud browser that exposes CDP or a direct browser API.
- This is where Browser Use direct-browser mode or Browserbase + Stagehand become relevant.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@browserbasehq/stagehand` v3 | Local browser mode and Playwright pages | Official docs explicitly support `env: "LOCAL"` and using custom pages with Playwright |
| `playwright` 1.58+ | File uploads via `setInputFiles()` | Important for resume upload, which pure browser agents routinely struggle with |
| Browser Use SDK | Direct browser via CDP | Useful future upgrade path if stealth infrastructure is needed without rewriting Playwright-like control logic |

## Sources

- Stagehand browser config docs — local vs Browserbase environment, local setup, and environment comparison: https://docs.stagehand.dev/v3/configuration/browser
- Stagehand model config docs — supported providers include DeepSeek and Ollama: https://docs.stagehand.dev/v3/configuration/models
- Stagehand `act()` and `observe()` docs — iframe support, hybrid action planning, and Playwright-page integration: https://docs.stagehand.dev/v3/basics/act and https://docs.stagehand.dev/v3/basics/observe
- Stagehand deterministic agent guide — local caching and converting agent exploration into predictable flows: https://docs.stagehand.dev/v3/best-practices/deterministic-agent
- Playwright input/file-upload docs: https://playwright.dev/docs/input
- Browser Use supported models and local Ollama support: https://docs.browser-use.com/open-source/supported-models
- Browser Use direct browser (Playwright/CDP) docs: https://docs.browser-use.com/cloud/tips/integrations/playwright
- Browserbase stealth mode docs, including signed-agent and CAPTCHA-solving product claims: https://docs.browserbase.com/features/stealth-mode

---
*Stack research for: AI-assisted job discovery and ATS automation*
*Researched: 2026-03-17*
