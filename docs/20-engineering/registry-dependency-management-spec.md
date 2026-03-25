# Registry Dependency Management Spec

This document defines the dependency management contract for registry items (theme/ui/block), including declaration, validation, graph resolution, preview behavior, and operational observability.

---

## Related Specs

- [Component Preview Runtime](./component-preview-runtime.md): preview build/runtime pipeline and rendering contract.

---

## 1. Goals

The system must provide:

1. **Single source of truth** for registry-to-registry dependencies (`registryDependencies`).
2. **Consistent behavior across all publish entry points** (REST, MCP, internal pipelines).
3. **Deterministic transitive resolution** (including version pin support and cycle detection).
4. **Stable preview behavior** for:
   - theme dependencies (CSS injection),
   - component dependencies (future source-level composition).
5. **Actionable diagnostics** for missing refs, cycles, permission issues, and silent drops.

Non-goals (for this version):

- npm package dependency solving (handled by `dependencies` / bare import extraction).
- lockfile-level install protocol redesign.

---

## 2. Core Data Model

## 2.1 Dependency Kinds

- `dependencies`: npm/bare module dependencies (e.g. `react`, `lucide-react`).
- `registryDependencies`: registry item references (e.g. `@owner/theme`, `@owner/button@1.2.0`).

These two fields have different semantics and must never be mixed.

## 2.2 Registry Dependency Ref Format

Accepted format:

- `@<owner>/<name>`
- `@<owner>/<name>@<version>`

Where:

- `owner`: canonical owner identifier used by resolver.
- `name`: registry item name (kebab-case).
- `version`: optional semver-like version string.

Invalid refs must be rejected at write time with a clear validation error.

## 2.3 Storage Contract

`registryDependencies` is stored in:

- `registry_items.registry_dependencies` (current snapshot)
- `registry_item_versions.registry_dependencies` (per-version history)

Invariant:

- for current version `v_current`, `registry_items.registry_dependencies` must match
  `registry_item_versions.registry_dependencies` of `v_current`.

---

## 3. Input/Write Contract (All Entry Points)

Every publish/update path must support `registryDependencies`:

- REST create item
- REST create version
- MCP `publish_component`
- any internal publish job

## 3.1 Semantics

Use explicit presence semantics:

- field **absent**: do not overwrite previous value on version update.
- field **present as []**: explicitly clear dependencies.
- field **present as non-empty array**: overwrite with normalized refs.

## 3.2 Shared Normalization

All entry points must call the same normalizer (`normalizeRegistryDependenciesInput`).

Required normalizer behavior:

- accept `string[]` and normalize trimming.
- reject invalid ref formats.
- deduplicate values.
- preserve order only if business logic requires it; otherwise sorted output is acceptable.

---

## 3.3 Provenance for Expanded Dependencies (Design System Collaboration)

### 3.3.1 Background

In design system collaboration flows, editors often **expand** dependencies locally to make a component runnable:

- Editing `Dialog` may pull in `FooterButton`, which itself depends on `Button`.
- The local working bundle may therefore contain *copies* of dependent component source files.

However, publishing this expanded bundle back to the registry as-is is incorrect:

- It would create duplicated components (e.g. two different `Button` implementations).
- It obscures the true dependency graph.
- It makes updates brittle and non-deterministic.

The system therefore needs a provenance contract to distinguish:

- **root-owned files** (belong to the component being published), vs
- **expanded dependency files** (originating from other registry items).

### 3.3.2 Provenance Manifest

Each local workspace (or install action) SHOULD produce a provenance manifest file (example name: `cozy.provenance.json`).

This manifest is not part of the published component source; it is a publishing aid.

Example shape:

```json
{
  "schemaVersion": 1,
  "root": { "ref": "@alice/dialog", "version": "0.4.0" },
  "files": [
    {
      "path": "Dialog.tsx",
      "source": "root"
    },
    {
      "path": "components/Button.tsx",
      "source": "registry",
      "ref": "@alice/button@1.2.0",
      "originalPath": "Button.tsx",
      "contentHash": "sha256:..."
    }
  ]
}
```

Fields:

- `schemaVersion`: integer, required.
- `root.ref`: canonical ref of the edited root item (`@owner/name`).
- `root.version`: the installed/present root version (optional but recommended).
- `files[]`:
  - `path`: relative path in local workspace.
  - `source`: `"root" | "registry" | "generated"`.
  - if `source === "registry"`:
    - `ref`: dependency ref used to fetch (`@owner/name@version` recommended pinned).
    - `originalPath`: path within the dependency bundle.
    - `contentHash`: hash of the installed content at expansion time (used for dirty detection).

Hash requirements:

- algorithm should be stable and explicit (e.g. `sha256:<hex>`).
- hash computed over the file bytes as stored in the local workspace at install/expand time.

### 3.3.3 Publish-Time Normalization (De-vendoring)

When publishing the root component:

1. **Derive** `registryDependencies` from `source: "registry"` entries by collecting their `ref` (deduped).
2. Do **not** publish `source: "generated"` files.
3. For `source: "registry"` files that exist in the local expanded bundle, the system SHOULD avoid publishing the dependency implementation into the root item.

Direct vs transitive dependencies:

- prefer declaring only **direct** dependencies on the root item, and rely on graph resolution for transitive deps.
- declaring transitive deps is allowed but should be avoided unless needed for policy reasons.

#### Stub + `_deps` strategy (Recommended)

To support cases where root source code imports dependencies via relative paths (e.g. `import { Button } from "./Button"`),
the system MAY normalize expanded dependency files into **stubs** instead of deleting them.

Concept:

- The local bundle may include a file like `Button.tsx` solely to satisfy `./Button` imports.
- On publish, `Button.tsx` is rewritten into a thin re-export stub that forwards to a materialized dependency under `_deps/...`.

Stub goals:

- preserve TypeScript type intelligence (Go to Definition, autocomplete)
- keep user import statements unchanged
- prevent publishing duplicated implementations into the root item

Stub template (v1):

```ts
// auto-generated by cozy registry. do not edit.
export * from "./_deps/<owner>/<name>/index";
```

Notes:

- Avoid emitting `export { default } ...` unless the dependency is known to have a default export.
- `_deps` location MUST be stable relative to the stub file to avoid complex `../../` path calculations; recommended to place `_deps` under the root bundle directory.

Materialized dependency directory:

- `_deps/<owner>/<name>/...`
- includes the dependency’s source files and a synthetic `index.tsx` that re-exports from a chosen entry file.

Version pinning:

- If the dependency ref includes a version (`@owner/name@x.y.z`), materialization SHOULD use that version.
- If ref is floating (`@owner/name`), materialization uses the current resolved version at build/install time.

### 3.3.4 Editing Dependency Files (Conflict Policy)

If a file with `source: "registry"` has a modified content hash at publish time (dirty):

The system MUST choose an explicit policy; the default should be strict:

- **Strict (default)**: block root publish; instruct user to publish the dependency item instead, or revert changes.
- **Split publish**: publish updated dependency item(s) first, then publish root with updated pinned refs.
- **Inline vendor (explicit opt-in)**: allow vendoring dependencies into root (duplicate code) but must be recorded and discouraged.

The chosen policy must be user-visible and logged.

### 3.3.5 Preview Semantics with Provenance

Preview should remain consistent with publish normalization:

- root preview uses root files + resolved dependency refs.
- expanded local copies are only an editor convenience and should not change the registry graph.

---

## 3.4 Provenance Consumption (API / Tooling Contract)

This section defines how provenance is transmitted and enforced during publish operations.

### 3.4.1 Transport Options

The system MAY support one or more of:

1. **Out-of-band manifest** (recommended): client/editor uses provenance locally to shape the publish payload (server never sees manifest).
2. **In-band manifest**: publish request includes a `provenance` object to enable server-side enforcement.

Option (1) is simplest; option (2) is safer and enables audits.

### 3.4.2 Publish Payload Extensions (Normative)

When using in-band manifest, publish APIs/tools MUST accept:

- `provenance`: an object matching section 3.3.2 (or a subset that includes `files[]` with `source/ref/contentHash`).
- `provenancePolicy`: `"strict" | "split" | "inlineVendor"` (default `"strict"`).

For REST endpoints, these fields live in the JSON body.
For MCP JSON-RPC tool calls, these fields live in `params.arguments`.

### 3.4.3 Server-side Enforcement

If `provenance` is provided, server MUST:

1. Validate schema version and required fields.
2. Partition local file payload into:
   - `rootFiles`: allowed to publish,
   - `expandedRegistryFiles`: must not be published when policy is strict/split,
   - `generatedFiles`: ignored.
3. Derive `registryDependencies` from `expandedRegistryFiles[*].ref` and normalize.
4. Compare hashes for `expandedRegistryFiles`:
   - if any are dirty, apply `provenancePolicy`.

### 3.4.4 Policy Semantics

- `strict`:
  - dirty expanded files => reject publish with error code `PROV_DIRTY_DEPENDENCY`.
- `split`:
  - dirty expanded files => publish dependent items first (requires explicit user opt-in and permissions),
    then publish root with pinned refs to new dependency versions.
- `inlineVendor`:
  - allow publishing expanded files into root bundle (vendoring) and record in metadata:
    - `meta.vendoredDependencies`: list of refs vendored.

### 3.4.5 Required Diagnostics

Publish responses MUST include a machine-readable summary when provenance is used:

- `appliedRegistryDependencies`: normalized list actually written.
- `droppedPaths`: list of paths dropped due to provenance.
- `dirtyDependencyPaths`: list of dirty dependency paths (if any).
- `policyApplied`: the effective policy used.

---

## 4. Graph Resolution Contract

## 4.1 Graph Node Identity

Node identity is `(owner, name, version?)`, where versioned refs are distinct nodes.

## 4.2 Resolution Rules

- resolve transitive dependencies depth-first or topologically.
- produce deterministic output order (deps-first).
- include cycle detection with cycle path details.
- expose unresolved refs as dangling edges.

## 4.3 Failure Modes

Resolver must return structured errors for:

- dependency not found,
- invalid ref,
- cycle detected,
- permission denied for private dependency.

At preview/runtime call sites, failure policy may be strict or soft by dependency class (see section 5).

---

## 5. Preview Contract

## 5.1 Theme Dependencies (Current)

Theme dependencies are collected transitively from `registryDependencies` and injected into preview HTML as CSS.

Behavior:

- order: dependencies first (stable), then root item local CSS.
- dedupe by `(owner, name)` unless version pin policy requires distinct entries.
- injection position: after Tailwind, before preview module script.

## 5.2 Component Dependencies (Target)

For `registry:ui` / `registry:block` dependencies, preview should support source-level composition.

Target behavior (MVP):

- fetch dependent source bundles transitively,
- place under namespaced virtual paths in temp build workspace,
- rewrite imports from registry refs to resolved local paths,
- bundle as single preview artifact.

## 5.3 Failure Policy in Preview

- theme dependency resolve failure: non-blocking by default, but observable.
- component dependency resolve failure: blocking (cannot safely render).

---

## 6. Observability and Debugging

Preview must provide opt-in diagnostics (example: `?debugTheme=1`):

- declared root `registryDependencies`,
- resolved transitive sources,
- injected/not-injected status,
- resolver error (if any).

Recommended extension:

- `?debugDeps=1` for full dependency graph snapshot (nodes, edges, dangling, cycles).

Server logs should include:

- raw input dependency payload (sanitized),
- normalized output,
- applied write target (create vs update),
- resulting stored value summary.

---

## 7. Versioning Strategy

Support two modes:

- floating ref: `@owner/name` (tracks current version)
- pinned ref: `@owner/name@x.y.z` (immutable target)

Policy recommendation:

- preview/dev: floating allowed.
- production/stable bundles: pinned preferred.

Future enhancement:

- add policy flag to enforce pinned refs in specific environments.

---

## 7.1 Contract Versioning (v1 → v2)

This spec defines **Contract v1** as the current public surface:

- `registryDependencies: string[]` using `@owner/name[@version]`
- `dependencies: string[]` for npm/bare imports (separate concern)

### 7.1.1 Compatibility Rules

- All systems MUST continue to accept Contract v1 indefinitely or until an explicit v2 deprecation window is announced.
- If v2 fields are introduced, resolvers MUST:
  - prefer v2 when present,
  - fall back to v1 when absent.

### 7.1.2 V2 Draft (Structured Registry Dependencies)

Motivation:

- allow richer semantics (optional deps, environment-specific deps, explicit kinds),
- support auditing and tooling,
- reduce ambiguity and reliance on string parsing.

Proposed v2 field (draft):

```json
{
  "registryDeps": [
    {
      "ref": "@alice/button@1.2.0",
      "kind": "ui",
      "optional": false,
      "scope": "runtime"
    }
  ]
}
```

Fields:

- `ref` (required): `@owner/name[@version]`
- `kind` (optional): `"theme" | "ui" | "block" | "unknown"` (used for validation and preview behavior)
- `optional` (optional): if true, resolver failures may downgrade to warnings in non-strict contexts
- `scope` (optional): `"runtime" | "preview" | "build"` (default `"runtime"`)

Migration strategy:

- Phase A: dual-write (write v1 + v2), read v2 first.
- Phase B: backfill v2 for existing items.
- Phase C: freeze v1 writes (still readable), v2 becomes canonical.

---

## 8. Error Codes (Normative)

Writers/resolvers should return machine-readable codes:

- `REGDEP_INVALID_FORMAT`
- `REGDEP_NOT_FOUND`
- `REGDEP_CYCLE_DETECTED`
- `REGDEP_PERMISSION_DENIED`
- `REGDEP_WRITE_DROPPED` (unexpected field drop/contract violation)
- `PREVIEW_THEME_RESOLVE_FAILED`
- `PREVIEW_COMPONENT_DEP_RESOLVE_FAILED`

Each error must include a user-friendly message and debugging context.

---

## 9. Acceptance Test Matrix

Minimum required test scenarios:

1. Create item with valid `registryDependencies` persists to snapshot + initial version.
2. Update version with field absent preserves previous value.
3. Update version with `[]` clears value.
4. Invalid ref rejected with `REGDEP_INVALID_FORMAT`.
5. Dangling ref yields `REGDEP_NOT_FOUND` at resolve time.
6. Cycle graph reports `REGDEP_CYCLE_DETECTED` with path.
7. Private dependency without access yields `REGDEP_PERMISSION_DENIED`.
8. Theme dependency transitive injection succeeds in preview.
9. Theme resolve failure sets debug payload and does not hard-crash preview page.
10. MCP publish path and REST publish path produce identical persisted values.

---

## 10. Rollout Plan

Phase 1 (completed/near-term):

- unify write-path support for `registryDependencies` across REST + MCP.
- add preview debug output for theme injection diagnostics.

Phase 2:

- enforce shared normalization in all internal pipelines.
- add dependency graph debug endpoint / debug query mode.
- add acceptance test matrix from section 9.

Phase 3:

- implement component dependency composition in preview build.
- define strict policy modes (pinned-only, private dependency gating).

---

## 11. Module Boundaries (Implementation Guidance)

This section describes recommended code boundaries to keep the system evolvable.

### 11.1 Normalize (Write Path)

Responsibilities:

- parse user/tool inputs,
- apply presence semantics (absent vs [] vs non-empty),
- validate and normalize refs,
- produce a canonical dependency list (v1) or object list (v2).

Outputs:

- `normalizedRegistryDependencies` (v1 string[])
- (future) `normalizedRegistryDeps` (v2 objects)

### 11.2 Resolve (Graph Path)

Responsibilities:

- build/resolve dependency graph,
- compute deps-first order,
- detect cycles,
- enforce permission checks,
- provide structured error codes and cycle paths.

Outputs:

- ordered nodes + metadata (sources, types)
- dangling edges (diagnostic)

### 11.3 Apply (Preview / Build Path)

Responsibilities:

- theme application: collect transitive theme CSS and inject into preview HTML
- component application (future): fetch transitive ui/block bundles and make them available to the bundler/runtime

Important:

- preview/build logic MUST only depend on resolver output, not raw DB fields.

### 11.4 Observe (Diagnostics)

Responsibilities:

- expose opt-in debug payloads (`debugTheme`, future `debugDeps`),
- log normalized inputs and applied writes,
- ensure “silent drops” are visible (`REGDEP_WRITE_DROPPED` / `PROV_*`).

---

## 11. Compatibility Notes

- Existing items without `registryDependencies` remain valid.
- Missing dependencies should fail only when graph resolution is required by the execution path.
- This spec is backward compatible with existing schema and resolver utilities.

