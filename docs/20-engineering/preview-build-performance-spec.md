# Preview Build Performance Spec

This document defines the near-term performance plan for the registry preview pipeline. It is intended for the preview/build agent implementing server-side and request-path optimizations.

It complements, but does not replace:

- [Component Preview Runtime](./component-preview-runtime.md): functional runtime/build contract
- [Registry Dependency Management Spec](./registry-dependency-management-spec.md): dependency resolution semantics, provenance, and sync-related metadata

---

## 1. Problem Statement

The current preview pipeline is functionally correct but too eager to recompute work on every request.

Today, a preview request typically performs all of the following from scratch:

1. Load the root registry item and its files
2. Resolve transitive registry dependencies
3. Resolve transitive theme CSS
4. Materialize transitive component source files under `_deps/...`
5. Create a fresh temp directory
6. Write the full source bundle to disk
7. Generate `preview-entry.tsx`
8. Run `esbuild`
9. Return HTML that still performs additional client-side dependency loading

This means the system often pays the full build cost even when:

- the same item/version was just previewed seconds ago
- the dependency graph has not changed
- the resulting JS/CSS bundle is byte-for-byte identical

The result is avoidable server latency and reduced preview throughput.

---

## 2. Goals

The performance work MUST improve preview latency without changing the correctness contract of preview rendering.

Required goals:

1. Avoid redundant server-side rebuilds for identical preview inputs
2. Avoid resolving the same dependency graph multiple times within one request
3. Reduce repeated filesystem work during preview bundling
4. Preserve existing preview correctness and error semantics
5. Keep the first implementation simple and observable

Non-goals for the MVP:

- redesigning the preview HTML or iframe protocol
- changing resolver semantics
- fully eliminating disk I/O from preview build
- implementing AST-level transform caching
- introducing a long-lived distributed cache from day one

---

## 3. Current Bottlenecks

### 3.1 Duplicate dependency resolution

The request path currently resolves dependencies more than once:

- once for component source materialization
- once for theme CSS collection

This duplicates graph traversal, permission checks, and item fetches.

### 3.2 No preview result cache

The system does not currently reuse previously built preview outputs. Identical requests rebuild the same JS and CSS bundle repeatedly.

### 3.3 Repeated temporary project creation

`buildPreviewBundle` creates a new temp directory for every preview build, writes all files to disk, then deletes the directory. This is safe but expensive.

### 3.4 Request-path repeated DB and resolver work

Resolver traversal is async and serial in important places. Without memoization, the same item or dependency may be fetched multiple times across a request burst.

### 3.5 Client-perceived cold load cost

Even after server build completes, preview HTML still loads external runtime dependencies such as Tailwind CDN and ESM CDN imports. This is mainly a client-perceived cost, but it affects overall preview feel.

---

## 4. Performance Strategy

The system SHOULD optimize in this order:

1. **Result caching**
2. **Single-pass dependency resolution**
3. **Request-level resolver memoization**
4. **Build workspace reuse / reduced temp I/O**
5. **Optional incremental build techniques**

The first three items are the MVP and provide the highest return for the lowest complexity.

---

## 5. Preview Result Cache (MVP, normative)

### 5.1 What to cache

The server SHOULD cache the expensive derived artifacts needed to serve preview HTML:

- built preview JS (`buildResult.code`)
- collected preview CSS (`buildResult.css`)
- resolved transitive theme CSS
- resolved component dependency source metadata sufficient for debugging

The cache MAY be in-memory for the first implementation.

### 5.2 Cache key

The cache key MUST represent every input that can affect preview output.

Minimum required key parts:

- root owner/name
- requested version (or effective current version)
- preview mode (`default | thumbnail`)
- root files fingerprint
- effective `previewExport`
- normalized runtime dependency list
- resolved registry dependency fingerprint

Recommended practical key shape:

```json
{
  "owner": "alice",
  "name": "dialog",
  "version": "1.2.0",
  "mode": "default",
  "rootFilesHash": "sha256:...",
  "previewExport": "Dialog",
  "runtimeDepsHash": "sha256:...",
  "registryGraphHash": "sha256:..."
}
```

### 5.3 Cache correctness rules

- A cache hit MUST be byte-safe: if any relevant input changes, a different key must be produced.
- A cache hit MUST preserve existing error behavior; only successful build outputs are cached by default.
- Error-result caching is optional and should be introduced only with short TTLs if needed.

### 5.4 Cache scope

MVP scope:

- process-local in-memory cache is acceptable
- no cross-process coordination required

Future scope:

- optional external cache or persisted artifact store for multi-instance environments

### 5.5 Eviction

The cache SHOULD use simple bounded eviction such as:

- max entry count, or
- approximate memory cap, or
- LRU

Eviction policy is implementation-defined for MVP, but unbounded growth is not acceptable.

---

## 6. Single-pass Dependency Resolution (MVP, normative)

The preview request path SHOULD resolve the dependency graph once per request and derive both of the following from the same resolved graph:

- transitive theme CSS
- transitive component source files

### 6.1 Required refactor

Instead of calling separate helpers that each invoke resolver traversal, the system SHOULD:

1. call `resolveRegistryDependencies(...)` once
2. derive theme CSS from the returned ordered graph
3. derive materialized component files from the same ordered graph

### 6.2 Why this matters

This removes redundant:

- graph traversal
- permission checks
- item fetches
- cycle detection work

### 6.3 API guidance

The codebase MAY:

- add a combined helper such as `resolvePreviewDependencies(...)`, or
- expose lower-level graph-derived helper functions that accept the already resolved `ordered` nodes

Either approach is acceptable as long as preview avoids resolving the same graph twice.

---

## 7. Request-level Resolver Memoization (MVP, normative)

Within a single preview request, repeated dependency lookups SHOULD be memoized.

### 7.1 Memoization targets

Memoization SHOULD cover at least:

- dependency access checks
- owner/name/version item fetches

### 7.2 Scope

MVP memoization is request-local only.

This avoids correctness problems with stale global caches while still reducing duplicate work during graph traversal.

### 7.3 Correctness

Memoization keys MUST include the request-visible identity of the item being fetched:

- owner
- name
- version
- request user / access context when relevant

---

## 8. Build Workspace Optimization

### 8.1 MVP expectation

The first implementation MAY keep disk-based esbuild inputs, but SHOULD reduce repeated temp-directory churn when possible.

Acceptable improvements:

- reuse a build workspace keyed by the preview cache key
- skip rewriting unchanged files in that workspace
- only regenerate `preview-entry.tsx` when its inputs change

### 8.2 Future improvement

The long-term preferred direction is to move toward an in-memory or plugin-backed virtual file input model for esbuild so the server does not need to write full temp projects for every cold build.

This is explicitly **not required** for the MVP.

---

## 9. Optional Incremental Build Techniques

These are later-phase improvements and MUST NOT block the MVP:

- esbuild `context` / incremental rebuild
- prebuilt dependency layer for frequent runtime deps
- persistent preview artifact store

These techniques are useful only after the simpler cache-first approach is in place and measured.

---

## 10. Client-perceived Performance (secondary)

This spec focuses on server-side preview build speed. However, client-perceived latency may still be affected by:

- Tailwind CDN script execution
- ESM CDN dependency downloads

Secondary improvements MAY include:

- replacing runtime Tailwind CDN with precomputed preview CSS where feasible
- reducing import-map dependency fan-out for common packages

These are lower priority than server-side caching and resolver optimization.

---

## 11. Observability

Performance work MUST be measurable.

The preview request path SHOULD record structured timing for at least:

- root item load
- dependency resolution
- theme CSS derivation
- component dependency materialization
- preview build cache lookup
- preview build execution
- total request time

Recommended debug additions:

- cache hit / miss flag
- cache key summary or digest
- counts:
  - resolved nodes
  - materialized dependency files
  - runtime bare dependencies

Debug information MAY be surfaced in logs first and later in `debugDeps` payloads.

---

## 12. Rollout Plan

### Phase 1: Result cache

Implement:

- in-memory cache for successful preview build results
- stable preview cache key
- bounded eviction

Expected outcome:

- repeated preview of the same item/version becomes near-instant on the server

### Phase 2: Single-pass resolution

Implement:

- resolve graph once
- derive theme CSS and component materialization from shared resolved output

Expected outcome:

- lower server latency for dependency-heavy previews

### Phase 3: Request-local memoization

Implement:

- memo for access checks and item fetches within the resolver/request path

Expected outcome:

- fewer duplicate DB hits and lower graph traversal overhead

### Phase 4: Build workspace optimization

Implement one of:

- keyed workspace reuse, or
- lower-write temp build strategy

Expected outcome:

- faster cold builds, especially for multi-file bundles

### Phase 5: Optional advanced optimization

Evaluate:

- esbuild incremental context
- externalized artifact cache
- client/runtime optimizations

Only pursue after measuring Phases 1–4.

---

## 13. Acceptance Criteria

The preview performance MVP is considered complete when:

1. Identical preview requests reuse cached build output
2. Preview path resolves the dependency graph only once per request
3. Resolver work is memoized within a request
4. Timing and cache hit/miss information are observable in logs or debug output
5. Existing preview correctness behavior is preserved:
   - component dependency failure still blocks preview
   - theme dependency failure remains non-blocking
   - preview output stays functionally identical for the same inputs

---

## 14. Implementation Guidance

Suggested file touch points:

- `app/preview/[owner]/[name]/route.ts`
  - add request-path timing
  - add preview result cache lookup / write
  - collapse duplicate dependency resolution

- `lib/registry-resolver.ts`
  - expose a shared resolved graph for preview use
  - add request-local memoization hooks or wrappers

- `lib/preview-build.ts`
  - support keyed workspace reuse or reduced write strategy
  - keep the build interface deterministic for caching

This work should preserve the existing public preview route and current HTML/debug behavior unless explicitly noted otherwise.
