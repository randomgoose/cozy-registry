## Publish Preview Smoke Gate

This document describes the publish-time preview smoke gate used by MCP tools:

- `diagnose_publish_readiness`
- `publish_component`

It is the operator-facing contract for what is blocked, what is allowed, and how to debug failures.

---

## Scope

The smoke gate applies to non-theme registry items:

- `registry:ui`
- `registry:block`
- `registry:component` (legacy alias of `registry:ui`)

`registry:theme` does not run preview render smoke, but has type/content consistency validation.

---

## Recommended Agent Flow

Use this sequence for AI-assisted publishing:

1. Call `diagnose_publish_readiness` with `runPreviewSmoke: true`.
2. If response is `ok: true`, call `publish_component`.
3. If response is not `ok`, fix the source and retry diagnosis.

This avoids writing broken items and keeps retries deterministic.

---

## Failure Categories

Structured failures return one of:

- `VALIDATION_FAILED`
- `PREVIEW_BUILD_FAILED`
- `PREVIEW_RENDER_FAILED`

All failures include machine-readable fields (`code`, `step`, `message`) for programmatic repair loops.

---

## What The Gate Blocks

### PREVIEW_BUILD_FAILED

Common causes:

- Missing source files or unresolved local imports.
- Unsupported bare-module imports (package not present in host runtime).
- Node built-in imports (for example `node:fs`) in component source.
- Bundling failures during smoke entry build.

### PREVIEW_RENDER_FAILED

Common causes:

- Invalid JSX element types (for example rendering `undefined` as a component).
- Runtime throw during render.
- Access to blocked runtime globals (for example `process` is not defined in smoke sandbox).
- Runtime module access outside React runtime allowlist.

---

## Runtime Hardening Guarantees

Smoke execution is intentionally constrained:

- Uses a dedicated VM context rather than host global context.
- Does not expose host `process` in the sandbox context.
- Runtime `require` is limited to React runtime modules only.
- Unknown bare imports fail early before execution.

This is a safety gate, not a full untrusted-code sandbox.

---

## Out Of Scope (Known Non-Goals)

Smoke gate is SSR-oriented and does not fully emulate browser interactivity. It does not guarantee detection of:

- Event-handler only failures (`onClick`, `onChange`, etc.).
- `useEffect`-only client-side failures.
- Browser-API issues that happen only after hydration.

For those cases, run additional browser-level tests.

---

## Test Matrix (Minimum Regression Set)

After gate changes, validate at least:

1. Undefined component render (`<Missing />`) -> `PREVIEW_RENDER_FAILED`
2. Sync throw in render -> `PREVIEW_RENDER_FAILED`
3. Unknown bare import -> `PREVIEW_BUILD_FAILED`
4. Node builtin import (`node:fs`) -> `PREVIEW_BUILD_FAILED`
5. `process` access in component render -> `PREVIEW_RENDER_FAILED`

