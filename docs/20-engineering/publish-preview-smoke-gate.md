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

---

## Edge-Case Checklist Before New Rules

Before introducing stricter publish requirements (for example mandatory `PreviewComponent`), review these scenarios:

1. **Named-only exports**  
   Components exported as `export function Foo()` without default export should remain publishable when `previewExport` is provided.
2. **Composite API exports**  
   Radix-style packages (`Dropdown.Root`, `Dropdown.Trigger`, `Dropdown.Content`) usually need a dedicated preview entry component.
3. **Re-export entry files**  
   `index.tsx` may only re-export symbols from nested files; export resolution should still provide actionable guidance.
4. **Provider-dependent components**  
   Some components require context providers to render correctly; failures should suggest wrapper/demo preview exports.
5. **Client-only API usage**  
   Accessing `window`, `document`, `localStorage`, or `process` may fail in SSR/sandboxed smoke. Errors should include repair hints.
6. **Async/lazy component paths**  
   `React.lazy`/dynamic imports can behave differently across runtimes; ensure smoke failure messages remain deterministic.
7. **Style-dependent visibility**  
   Components that rely on external CSS variables may "render" but appear unusable; this is a warning case, not a hard block.
8. **Heuristic export selection ambiguity**  
   Multiple export candidates should prefer explicit `previewExport` rather than guessing silently.

---

## Decision Policy: Block vs Warn

Use this policy to keep rules strict on correctness but light on authoring friction:

- **Block publish** for deterministic correctness/security failures:
  - Build failures, unresolved imports, unsupported modules, runtime render crashes.
- **Warn only** for usability/quality risks:
  - Missing representative preview state, style-variable visibility issues, non-critical heuristic ambiguity.
- **Recommend explicit metadata** (`previewExport`) whenever multiple export candidates exist.

---

## Suggested Next Increment (Low-Risk)

To improve multi-part component usability without heavy rules:

1. Keep `PreviewComponent` as a recommended pattern, not mandatory.
2. Improve "No suitable component export" diagnostics to explicitly suggest:
   - Add `previewExport`, or
   - Add `export default`, or
   - Add a dedicated `PreviewComponent`.
3. Return detected export candidates in diagnosis output (advisory field), while preserving existing gate behavior.

---

## Verified Scenarios (2026-03)

The following scenarios were validated in end-to-end MCP publish flows:

1. **Named export only (no default export)**  
   - Result: blocked with `PREVIEW_RENDER_FAILED`.
   - Behavior: error includes detected exports and explicit fix guidance (`previewExport` / `default export` / `PreviewComponent`).
2. **Undefined rendered component (`<Missing />`)**  
   - Result: blocked with `PREVIEW_RENDER_FAILED`.
3. **Render-time throw**  
   - Result: blocked with `PREVIEW_RENDER_FAILED`.
4. **Node built-in module import (for example `node:fs`)**  
   - Result: blocked with `PREVIEW_BUILD_FAILED`.
5. **Third-party UI package imports (for example `@radix-ui/react-dropdown-menu`)**  
   - Result: allowed through smoke via stubs (not blocked as unsupported bare imports).
6. **Client component with `import * as React` and `React.useState`**  
   - Result: supported after runtime interop fix.
7. **JSX namespace member usage (`<Pkg.Root />`) from namespace imports**  
   - Result: supported after JSX member stub detection fix.

---

## Regression Checklist (Release Gate)

Run this checklist after smoke/runtime changes and before release:

1. Publish named-export-only component without `previewExport` -> expect **fail** with actionable guidance.
2. Publish component rendering `<Missing />` -> expect **fail** (`PREVIEW_RENDER_FAILED`).
3. Publish component importing `node:fs` -> expect **fail** (`PREVIEW_BUILD_FAILED`).
4. Publish component importing unknown third-party package (stub path) -> expect **pass** smoke build gate.
5. Publish Radix dropdown-style component:
   - namespace import (`import * as Dropdown from ...`)
   - JSX namespace members (`<Dropdown.Root />`)
   - `use client` + `React.useState`
   -> expect **pass** and preview visible.
6. Re-run `diagnose_publish_readiness` with `runPreviewSmoke: true` for each case above and confirm `failureCategory` consistency.

