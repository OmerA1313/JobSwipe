# Concerns

## 1. Oversized Frontend Surface
- `app/page.tsx` is the dominant UI module and holds too many responsibilities:
  - feed state
  - profile editing
  - applications
  - automation tracking
  - dev tooling
  - debug rendering
- This will slow iteration and make regressions harder to isolate.

## 2. No Automated Tests
- The codebase currently depends on manual validation and build/type checks.
- The highest-risk logic has no regression protection:
  - parsing brittle third-party HTML
  - ranking logic
  - automation state transitions
  - browser execution behavior

## 3. Historical Automation Layers Still Coexist
- The repo contains multiple generations of automation architecture:
  - `scripts/automation-worker.js`
  - Anchor / Browserbase / Skyvern workflow JSON
  - AI-agent workflow experiments
  - current Stagehand runner
- This creates ambiguity about the supported path and increases maintenance cost.

## 4. Fragile External Integrations
- Job ingestion depends on public endpoints and HTML structures that can change without notice.
- `LinkedIn`, `Glassdoor`, and parts of `HireMeTech` are especially brittle.
- Browser automation targets anti-bot systems and UI changes that are inherently unstable.

## 5. Binary Files in SQLite
- Resume PDFs are stored as blobs in SQLite on both profile and application records.
- This is acceptable for a prototype, but it is not a durable long-term storage pattern.
- It also complicates export, backup, and scaling.

## 6. Checked-In/Present Experimental Workflow Debt
- `n8n/` contains multiple workflow variants that may no longer reflect the real execution path.
- `docs/` also contains setup notes for older approaches.
- The codebase map should be revisited after obsolete workflow files are removed.

## 7. Worktree Hygiene Problem
- The current worktree contains untracked Stagehand browser profile artifacts under `\\wsl.localhost...`.
- They are not tracked, but their presence indicates the runner is writing noisy local state into the repo tree.
- This should be fixed or more aggressively ignored to avoid accidental commits and repo pollution.

## 8. Environment-Coupled Behavior
- App behavior depends heavily on local environment wiring:
  - Ollama reachability
  - local Chromium path
  - `n8n` networking
  - webhook URLs
- This makes the system harder to reproduce and deploy cleanly.

## 9. Secret-Handling Risk
- The repo itself is not currently exposing keys in tracked files based on the inspected code paths.
- But the workflow clearly relies on many env/config secrets.
- Given the amount of local experimentation around `n8n`, browser tools, and providers, secret hygiene needs discipline.

## 10. Product/Architecture Boundary Still Moving
- The project is still deciding between:
  - deterministic adapters
  - hybrid AI-assisted automation
  - orchestrated local runners
- That is acceptable at prototype stage, but it means architecture docs will age quickly unless periodically refreshed.
