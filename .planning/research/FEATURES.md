# Feature Research

**Domain:** AI-assisted job discovery and ATS automation
**Researched:** 2026-03-17
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Profile and resume storage | Needed for repeated applications | LOW | Already partly implemented |
| Relevant job discovery and filtering | Without this, the swipe metaphor is cosmetic | MEDIUM | Current feed/ranking exists and should be hardened |
| Application tracking | Users need to know what happened after they apply | MEDIUM | Already present and should remain first-class |
| Resume upload into ATS forms | Essential to actual application completion | HIGH | Needs deterministic file upload and robust diagnostics |
| Explicit blocker explanation | Users tolerate failure if the app explains why | MEDIUM | Tracking/debug surfaces already point in this direction |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Swipe-based discovery with real matching | Makes job search feel faster and more engaging than boards | MEDIUM | This is the product identity; keep it prominent |
| AI-assisted resume tailoring per job | Improves application quality, not just application volume | MEDIUM | Can be staged: summaries first, stronger tailoring later |
| Semi-hands-off auto-apply on supported ATS families | Strong investor-demo story and real user value | HIGH | Must be marketed as supported-site automation, not universal magic |
| Rich run diagnostics in the product | Builds user trust and accelerates debugging/operator workflow | MEDIUM | Already partially implemented with snapshots/events |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| “Apply to any site automatically” | It sounds like the ultimate promise | Technically unstable, legally risky, and impossible to deliver reliably at MVP stage | Promise strong support for named ATS families first |
| Fully hidden failure states | Seems smoother in demos | Destroys user trust when applications silently fail | Keep clean user-facing blockers and tracking |
| Over-optimizing for maximum volume of applications | Feels like success by numbers | Encourages low-quality, mismatched applications and weakens product credibility | Optimize for relevant jobs + higher-quality applications |

## Feature Dependencies

```text
Profile + Resume
    └──requires──> Resume parsing and storage

Auto-apply on ATS families
    └──requires──> Browser executor + ATS adapters
                       └──requires──> Run tracking + blocker handling

AI tailoring
    └──enhances──> Job discovery and auto-apply

Universal-site auto-apply
    └──conflicts──> Reliable MVP scope
```

### Dependency Notes

- **Auto-apply requires tracking:** without explicit run state and blocker capture, failures are impossible to debug or explain.
- **AI tailoring enhances discovery and apply quality:** it should support the core loop, not replace it.
- **Universal-site support conflicts with reliability:** it is a roadmap aspiration, not a launch requirement.

## MVP Definition

### Launch With (v1)

- [ ] Swipe-based discovery on a curated set of relevant jobs
- [ ] User profile, resume PDF, and reusable application context
- [ ] Reliable auto-apply flows for a few ATS families
- [ ] Tracking tab with blocker visibility, snapshots, and final state
- [ ] AI-assisted tailoring that improves job summaries and application materials

### Add After Validation (v1.x)

- [ ] Broader ATS-family coverage after two or three families are stable
- [ ] Better answer-memory and reusable question handling across runs
- [ ] Stronger tailored resume generation once the application engine is stable

### Future Consideration (v2+)

- [ ] Broader “bring your own session” support for authenticated job boards
- [ ] Team/admin tooling, analytics, and performance reporting
- [ ] Paid stealth/browser infrastructure where ROI justifies it

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Swipe job feed with relevance | HIGH | MEDIUM | P1 |
| ATS auto-apply for supported families | HIGH | HIGH | P1 |
| Tracking with blockers and snapshots | HIGH | MEDIUM | P1 |
| AI resume tailoring | HIGH | MEDIUM | P1 |
| Broad cross-site automation | HIGH | HIGH | P3 |
| Deep growth analytics | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Existing market pattern | Our Approach |
|---------|--------------------------|--------------|
| Auto-apply | Often over-promised, opaque, and unstable across sites | Be explicit about supported ATS families and show run-level evidence |
| AI application help | Commonly focused on volume and generic content generation | Focus on relevance, tracking, and quality support for actual applications |
| Discovery UX | Usually board-style lists | Keep swipe-first experience as the visible differentiator |

## Sources

- Internal codebase map in `.planning/codebase/`
- Current product goals captured in `.planning/PROJECT.md`
- Stagehand, Browser Use, Browserbase, and Playwright docs used to assess what automation features are realistic in practice

---
*Feature research for: AI-assisted job discovery and ATS automation*
*Researched: 2026-03-17*
