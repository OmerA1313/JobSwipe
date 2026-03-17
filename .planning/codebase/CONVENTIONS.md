# Conventions

## Language and Type Safety
- TypeScript is used throughout the main app codebase.
- `strict: true` is enabled in `tsconfig.json`.
- Route handlers and lib functions generally use explicit payload typing.
- Serialization helpers normalize unknown event payloads before exposing them to the UI.

## Module Style
- Imports use the `@/*` path alias for app-local modules.
- Most modules are small procedural service files rather than classes.
- Code favors plain functions and explicit data transforms over abstraction-heavy patterns.

## API Route Style
- Route handlers are thin and mostly:
  - call `ensureBootstrap()`
  - validate request input
  - delegate to a lib function
  - return JSON
- Error responses are plain JSON with `message`.
- Many routes log server-side failures with `console.error`.

## Persistence Conventions
- Prisma is the sole DB access path.
- Binary resume files are stored directly on records.
- Automation event payloads are stored as JSON strings and parsed later.
- Event history is used as the canonical source for debug detail reconstruction.

## UI Conventions
- The frontend is a single client component using `useState`, `useEffect`, and helper functions in-file.
- Inline type definitions for API payloads are colocated in `app/page.tsx`.
- Styling appears to rely on global CSS plus inline styles for many debug/admin surfaces.
- Debug sections use `<details>` and `<pre>` for raw payload visibility.

## Error Handling Conventions
- External-source adapters typically fail soft at the aggregate level:
  - each adapter can fail
  - refresh continues with partial results
- Automation surfaces failures through:
  - `AutomationRun.status`
  - `blockingQuestion`
  - `lastError`
  - `AutomationEvent`
- Browser/tool debug payloads are kept in event payloads and summarized for the UI.

## Automation Conventions
- Site detection is centralized in `detectAutomationSite()`.
- Implemented automation families are explicitly listed in `IMPLEMENTED_AUTOMATION_SITES`.
- Hybrid automation prefers deterministic fills for critical actions and AI reasoning for ambiguous navigation.
- Human-check and captcha-like states are normalized into explicit manual-attention messaging.

## Notable Style Gaps
- There is no visible lint configuration beyond `next lint`.
- No shared component system is extracted from the large page component.
- The codebase is pragmatic and prototype-driven rather than highly standardized.
