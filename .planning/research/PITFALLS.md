# Pitfalls Research

**Domain:** AI-assisted job discovery and ATS automation
**Researched:** 2026-03-17
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Designing the MVP around CAPTCHA bypass

**What goes wrong:**  
The product promise assumes hostile sites can be automated hands-free from day one.

**Why it happens:**  
It is tempting to treat CAPTCHA and anti-bot checks as just another engineering bug.

**How to avoid:**  
Scope the MVP around ATS families that can be automated reliably and treat hostile human checks as a separate commercialization problem, not the foundation of the MVP.

**Warning signs:**  
- Roadmap language says “any site” or “fully hands-off” too early  
- Tool selection is driven mainly by stealth/CAPTCHA marketing  
- Successful runs cannot be reproduced locally without paid infrastructure

**Phase to address:**  
Phase 1 and Phase 2

---

### Pitfall 2: Using a pure browser agent for final submission

**What goes wrong:**  
The agent can find the right page or button but fails on required fields, file upload, validation, or submit confirmation.

**Why it happens:**  
Browser agents are best at ambiguous navigation, not always at the repeatable last mile.

**How to avoid:**  
Use AI for entry-point discovery and ambiguous interpretation, then deterministic Playwright for fill, upload, and submit checks.

**Warning signs:**  
- Agent traces skip visible required fields  
- Submit attempts happen before contact fields are filled  
- Resume upload is the recurring failure point

**Phase to address:**  
Phase 2

---

### Pitfall 3: Chasing provider churn instead of a stable executor contract

**What goes wrong:**  
The team keeps swapping Anchor, Browserbase, Browser Use, Skyvern, or other tools without a stable internal boundary.

**Why it happens:**  
Each provider looks like the missing piece when failures are really about architecture or product scope.

**How to avoid:**  
Define a stable internal executor contract first: input context, run events, snapshots, blocker outputs, and final statuses.

**Warning signs:**  
- Workflow files proliferate for multiple vendors  
- The UI/debug layer changes every time a browser tool changes  
- The app cannot switch providers without rewriting orchestration

**Phase to address:**  
Phase 1

---

### Pitfall 4: No operator visibility into failed runs

**What goes wrong:**  
Runs end in `FAILED` or `NEEDS_INPUT` without enough evidence to know whether the agent reached the form, uploaded the resume, or hit a validation gate.

**Why it happens:**  
Debug payloads, screenshots, and action traces are treated as optional.

**How to avoid:**  
Make snapshots, action traces, final URL, and normalized blocker messaging first-class.

**Warning signs:**  
- Tracking shows status but no concrete evidence  
- Engineers have to reproduce failures manually to understand them  
- “successful” workflow executions still leave ambiguity

**Phase to address:**  
Phase 1 and Phase 2

---

### Pitfall 5: Letting the UI monolith slow down the product

**What goes wrong:**  
Every new automation/debug/product feature lands in one oversized page component.

**Why it happens:**  
Prototype momentum makes it easy to keep extending the same file.

**How to avoid:**  
Split the product into bounded UI modules before the investor-demo surface becomes too fragile.

**Warning signs:**  
- `app/page.tsx` keeps absorbing unrelated features  
- Small changes cause broad UI regressions  
- Tracking/debug work blocks discovery/product iteration

**Phase to address:**  
Phase 1

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Resume blobs in SQLite | Simple local MVP storage | Hard to scale and awkward to migrate | Acceptable for MVP only |
| Multiple historical workflow files kept forever | Faster experimentation | Confusion about the supported path | Acceptable temporarily, not once the MVP path is chosen |
| One giant UI page | Fast prototyping | Slower product iteration and debugging | Acceptable only while reshaping the MVP |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stagehand LOCAL | Treating local AI actions as free and deterministic | Cache successful flows and constrain AI to navigation/interpretation |
| Ollama | Assuming any local model is good enough for browser control | Validate models on actual ATS flows; use stronger hosted models only if ROI is clear |
| n8n | Putting browser intelligence inside orchestration | Keep `n8n` deterministic and let the executor own browser logic |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Repeated full-agent exploration on every run | Slow runs, high token use, inconsistent actions | Cache or convert discovered flows into deterministic scripts | Immediately, even at low volume |
| Serial browser retries without clear stop conditions | Long-running jobs with no useful outcome | Normalize blocker states and bounded retry policies | Very early |
| Storing large inline debug artifacts forever | DB growth and slower payloads | Move screenshots to files/object storage once beyond MVP | Once runs become frequent |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Pasting API keys into chats or workflow files | Credential exposure | Keep secrets in env/credential stores only |
| Treating hostile-site automation as legally neutral | Product and account risk | Keep terms/compliance review explicit as the product scope expands |
| Letting raw debug payloads expose sensitive user data | Privacy leakage | Redact or minimize payloads before broader deployment |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent automation failure | User loses trust immediately | Show blocker reason, snapshot, and latest action evidence |
| Asking users to solve tooling problems | Product feels like a dev tool, not a job product | Only ask for job-relevant answers and decisions |
| Prioritizing application volume over relevance | Users get low-quality outcomes and poor employer fit | Keep matching quality and tailored applications central |

## "Looks Done But Isn't" Checklist

- [ ] **ATS support:** Flow reaches the real application form, not just the listing page
- [ ] **Resume upload:** File upload works end-to-end on the supported ATS family
- [ ] **Submit confirmation:** Final status is based on explicit confirmation, not assumption
- [ ] **Tracking:** Every terminal failure shows enough evidence to diagnose it
- [ ] **Investor demo:** Supported-site claim is honest and reproducible

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong provider/tool choice | MEDIUM | Preserve internal executor contract, swap backend without changing app state model |
| Fragile ATS adapter | MEDIUM | Move repeated agent-discovered actions into deterministic code and add replay/debug evidence |
| Overscoped MVP promise | HIGH | Narrow supported-scope messaging and re-cut roadmap around proven ATS families |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CAPTCHA-first architecture | Phase 1 | Requirements and roadmap scope exclude universal hands-free claims |
| Pure-agent final submission | Phase 2 | Supported ATS flows use deterministic fill/upload/submit steps |
| Poor debug visibility | Phase 1 | Tracking surfaces snapshots, actions, and blocker reasons |
| Executor/provider churn | Phase 1 | App uses a stable internal executor contract |

## Sources

- Stagehand docs on deterministic caching and hybrid action planning
- Playwright docs on reliable interaction primitives
- Browser Use docs on local models and direct browser/CDP mode
- Browserbase docs on stealth / signed-agent capabilities, used here as a future paid comparison point rather than an MVP dependency

---
*Pitfalls research for: AI-assisted job discovery and ATS automation*
*Researched: 2026-03-17*
