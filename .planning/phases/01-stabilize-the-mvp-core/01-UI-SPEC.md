---
phase: 01
slug: stabilize-the-mvp-core
status: approved
reviewed_at: 2026-03-17T16:30:00+02:00
shadcn_initialized: false
preset: none
created: 2026-03-17
---

# Phase 01 — UI Design Contract

> Visual and interaction contract for frontend phases. Generated for Phase 1 tracking/profile stabilization and moderate UI refresh.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none |
| Icon library | none |
| Font | `"Avenir Next", "SF Pro Display", "Segoe UI", sans-serif` |

### Visual anchor

- Preserve the current atmospheric light interface rather than redesigning the product from scratch.
- Primary visual anchor on the page: the active content surface itself, not the topbar chrome.
- For this phase, the focal points must be:
  - `TrackingSurface`: latest run status, blocker, and evidence card
  - `ProfileSurface`: resume/profile readiness state and save action
- Raw debug data stays visible, but it must sit below the normalized summary and evidence.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | inline icon/text gaps, status dots |
| sm | 8px | compact chip spacing, micro-actions |
| md | 16px | default control spacing, card internals |
| lg | 24px | section padding, grouped content blocks |
| xl | 32px | major layout gaps between surfaces |
| 2xl | 48px | large section breaks and hero-to-content spacing |
| 3xl | 64px | page-level breathing room on desktop |

Exceptions: none

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px | 400 | 1.5 |
| Label | 14px | 700 | 1.4 |
| Heading | 20px | 700 | 1.2 |
| Display | 44px | 700 | 0.95 |

### Hierarchy rules

- Use exactly these four sizes in the extracted Phase 1 surfaces.
- Tracking summaries and profile readiness states should rely on weight and spacing changes, not ad-hoc intermediate font sizes.
- Raw payload blocks remain monospaced only inside `pre`/debug containers and do not introduce a fifth semantic text size.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#F3F7FB` | page background, ambient layout field, overall canvas |
| Secondary (30%) | `#FFFFFF` | cards, panels, drawers, surfaced tracking/profile sections |
| Accent (10%) | `#155EEF` | primary CTA, active tab, focus ring, selected state, key status emphasis |
| Destructive | `#E5484D` | destructive actions, failed state emphasis only |

Accent reserved for: primary CTA, active tab, keyboard focus ring, current-step highlight, and the single most important status chip in a run card.

### Supporting colors

- Supporting calm accent: `#0E7490` for non-primary highlights and ambient gradients only.
- Success state: `#0F9F6E` for submitted/healthy confirmations.
- Muted text: `#5F7187`.
- Primary ink: `#102033`.
- Borders and separators should remain low-contrast blue-gray, not saturated accent lines.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | `Save profile changes` |
| Empty state heading | `No automation runs yet` |
| Empty state body | `Start an apply run on a supported job to see status, blockers, and browser evidence here.` |
| Error state | `We couldn't load the latest automation details. Refresh the page or retry the run after checking the latest event.` |
| Destructive confirmation | `Delete saved resume`: `Remove the current PDF resume from your profile? Existing run history stays intact.` |

### Status copy rules

- `Needs input` is reserved for job-relevant questions only.
- `Manual attention` is reserved for technical or human-verification boundaries.
- `Failed` is reserved for genuine execution failures.
- Do not show vague labels like `Blocked`, `Unknown`, or `Error` without a normalized explanation directly beneath them.

### Tracking evidence order

Every blocked or failed run must present content in this order:
1. normalized status + current step
2. blocker explanation
3. screenshot evidence
4. action trace
5. raw payloads and provider-specific debug data

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | none | not applicable |

---

## Surface Contract

### ProfileSurface

- Should feel operational and trustworthy, not like a generic settings form.
- Resume readiness must be visible above lower-priority optional links.
- Group inputs into:
  - core application identity
  - resume assets
  - role/location preferences
- Save state and missing-required-field feedback must be obvious without reading raw text walls.

### TrackingSurface

- The current/latest run should dominate the surface visually.
- Screenshot evidence should be large enough to be legible and must not be visually buried below raw JSON.
- Action trace should read like a timeline of what the browser did, not an unstructured dump.
- Raw debug payloads can remain expanded by default in Phase 1, but summary information must still win visually.

### FeedSurface interaction with extracted areas

- Feed does not get a full redesign in Phase 1.
- It should visually stay compatible with refreshed tracking/profile surfaces through shared tokens, spacing, and card treatment.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-03-17
