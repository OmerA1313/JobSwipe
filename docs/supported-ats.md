# Supported ATS Families

This document is the Phase 2 source of truth for what the product claims about ATS-family auto-apply support.

## Support labels

- `supported`
  - the family can reach, fill, upload, submit, and verify completion at the current support bar
- `partially_supported`
  - the family has an active auto-apply path under evaluation, but the product does not yet claim the full support bar
- `unsupported`
  - the family may still appear in discovery, but auto-apply is not part of the active runtime

## Phase 2 rule

- `Comeet` is the only ATS family under active Phase 2 hardening
- no other family should be treated as an active auto-apply path
- discovery can still show non-Comeet jobs
- feed filtering should allow the user to focus on supported auto-apply families only

## Current matrix

| ATS family | Status | Auto-apply availability | Notes |
|---|---|---|---|
| `Comeet` | `partially_supported` | `enabled` | Active family under evaluation in `comeet-phase2-v1`. The product can attempt auto-apply, but the support claim is not complete until the test set shows repeatable submit + verification. |
| `Lever` | `unsupported` | `disabled` | Discovery-only until it is promoted into an active phase. |
| `Greenhouse` | `unsupported` | `disabled` | Discovery-only until it is promoted into an active phase. |
| `LinkedIn` | `unsupported` | `disabled` | Discovery-only until it is promoted into an active phase. |
| `Unknown / other` | `unsupported` | `disabled` | No auto-apply claim. |

## Named support set

Phase 2 support claims must be backed by a named support cohort, not anecdotal runs.

Current cohort:

- `comeet-phase2-v1`

Each support case in that cohort should record:

- the ATS family
- the job posting
- the expected outcome
- the latest observed run status
- the latest normalized outcome category
- verification notes

## Product behavior

- auto-apply should only queue jobs whose ATS family has `autoApplyEnabled = true`
- jobs from other families can stay visible in discovery
- blocked or failed runs must still report normalized categories and evidence
- `partially_supported` does not mean the support bar is met; it means the family is the active candidate being hardened
