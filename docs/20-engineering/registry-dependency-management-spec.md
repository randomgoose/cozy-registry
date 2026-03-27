# Registry Dependency Management Spec

This document defines the dependency management contract for registry items (theme/ui/block), including declaration, validation, graph resolution, preview behavior, and operational observability.

This spec also defines the near-term direction for **registry sync**: the product should evolve from a defensive provenance system into a **divergence-aware system** that can classify local instances, explain drift, and generate safe update plans. It does **not** yet standardize automatic merge/migration.

---

## Related Specs

- [Registry design discussion queue](./registry-design-discussion-queue.md): prioritized backlog for dependency/stub/resolver evolutions (**discussion only**, not implementation commitments).
- [Component Preview Runtime](./component-preview-runtime.md): preview build/runtime pipeline and rendering contract.
- [Install Protocol](./install-protocol.md): project-side installation and lockfile contract.

**Human-in-the-loop dependency suggestions** (AST + catalog matching, non-blocking health checks) are normative in **§1.1**, **§3.6**, **§3.7**.

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
6. **Divergence-aware install metadata** so local instances can be classified as clean / modified / forked.
7. **Sync planning primitives** that help tools decide whether a new upstream version is safe to apply automatically or needs review.

Non-goals (for this version):

- npm package dependency solving (handled by `dependencies` / bare import extraction).
- lockfile-level install protocol redesign.
- fully automatic AST-level migration / merge of local forks.

---

## 1.1 Core principles (explicit deps, suggestions, determinism)

These principles govern **product and agent behavior** alongside the technical contracts below. They do not replace §2–§4; they constrain how **suggestions**, **publishing**, and **resolution** interact.

1. **Dependencies MUST be explicit in storage**  
   The persisted graph (`registryDependencies` per §2.3) is the source of truth. Nothing may silently add or remove registry edges without a user-visible write.

2. **Dependencies SHOULD be version-pinned for reproducibility**  
   Refs MAY use either personal form `@user/name` or team form `@org/team/name`, with optional version pinning (`@...@version`); see §7. Pinned refs are recommended for stable, debuggable builds. Stricter “no floating” policies are a future policy flag, not required by Contract v1.

3. **The system MAY suggest; it MUST NOT auto-decide**  
   Code analysis or catalog matching MAY produce **suggestions** (§3.6). Persisted `registryDependencies` MUST only change when the user/agent **explicitly** confirms them in the publish payload (or equivalent confirmed action). No automatic linking, no automatic import rewrites, no silent DB writes.

4. **Publish MUST be deterministic with respect to declared inputs**  
   Given the same declared `registryDependencies` and source bundle, publish normalization MUST NOT “re-guess” dependencies or override confirmed values. Stub inference (§3.5.2) remains opt-in and diagnostic-first.

5. **Runtime resolution MUST NOT depend on provenance or stub heuristics**  
   Preview, install, and graph resolution (§4) MUST use **persisted** refs and resolver output only. Provenance manifests (§3.3–§3.4) are **publish-time aids** for de-vendoring and explicit derivation when provided; they MUST NOT define an alternate implicit resolution path at preview/install time. Stub scanning MUST NOT substitute for declared deps unless the caller explicitly opts in (`applyStubInference`).

6. **Outdated-dependency signals MUST be non-blocking by default**  
   Health or version-drift warnings (§3.7) MUST NOT block publish or auto-upgrade refs unless a separate, explicit policy is introduced later.

7. **Divergence MUST be modeled, not treated as exceptional by default**  
   Local edits to installed registry source are expected. The system SHOULD classify divergence and surface consequences. It MUST NOT assume every dirty file is an error; it also MUST NOT silently collapse all divergence into “still clean”.

8. **Dirty is a signal; fork is a state**  
   A byte/content mismatch only proves that local content changed. Tooling MAY classify a local instance as `modified` or `forked`, but MUST NOT equate “dirty” with “forked” without additional heuristics or explicit user intent.

---

## 2. Core Data Model

## 2.1 Dependency Kinds

- `dependencies`: npm/bare module dependencies (e.g. `react`, `lucide-react`).
- `registryDependencies`: registry item references (e.g. `@alice/theme`, `@gate/design-system/button@1.2.0`).

These two fields have different semantics and must never be mixed.

## 2.2 Registry Dependency Ref Format

Accepted format:

- `@<user>/<name>`
- `@<user>/<name>@<version>`
- `@<org>/<team>/<name>`
- `@<org>/<team>/<name>@<version>`

Where:

- `user`: canonical personal owner identifier used by resolver.
- `org`: canonical organization / workspace slug for team-owned items.
- `team`: canonical team slug within the organization.
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

## 2.4 Install-instance metadata (MVP direction)

Dependency storage (§2.3) records the **registry graph**. Sync requires additional metadata for **local installed instances**.

At install/upgrade time, tooling SHOULD persist enough metadata to identify a local instance of a registry item:

- upstream ref (`@user/name` or `@org/team/name`)
- installed version
- install root/path
- original fingerprint captured at install time
- current observed fingerprint (recomputed during status/sync analysis)
- instance status (`clean | modified | forked`)

This metadata MAY live in the project lockfile, a sidecar state file, or a future dedicated install-state file. The exact storage location is implementation-defined for v1, but the semantics are normative for sync/status tooling.

## 2.5 Instance status model (normative for sync/status tooling)

When evaluating a local installed instance against its upstream source/version, tooling SHOULD classify it as:

- `clean`: local fingerprint matches installed upstream baseline.
- `modified`: local fingerprint differs, but lineage is still recognized and the instance is still considered eligible for review-based sync.
- `forked`: divergence is significant enough that the instance should no longer be treated as safely auto-updatable without explicit merge/rebase intent.

Notes:

- `dirty` is an implementation-level detection result, not a user-facing lifecycle state.
- `forked` MAY be inferred heuristically or set explicitly by the user/tooling.
- Status classification rules may evolve, but `clean` MUST remain a strict equality/baseline match.

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

### 3.1.1 Dependency Inheritance (AI-friendly Default)

For updates (new versions), the default behavior MUST be inheritance:

- If `registryDependencies` is **absent**, keep the previous version’s `registryDependencies`.
- Only an explicit `registryDependencies: []` clears dependencies.

Rationale:

- Enables AI/editor workflows to publish iterative changes without repeatedly re-declaring the dependency graph.
- Prevents accidental dependency loss when payloads are regenerated (e.g. switching from single-file to multi-file).

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
  "root": { "ref": "@acme/marketing/dialog", "version": "0.4.0" },
  "files": [
    {
      "path": "Dialog.tsx",
      "source": "root"
    },
    {
      "path": "components/Button.tsx",
      "source": "registry",
      "ref": "@acme/design-system/button@1.2.0",
      "originalPath": "Button.tsx",
      "contentHash": "sha256:..."
    }
  ]
}
```

Fields:

- `schemaVersion`: integer, required.
- `root.ref`: canonical ref of the edited root item (`@user/name` or `@org/team/name`).
- `root.version`: the installed/present root version (optional but recommended).
- `files[]`:
  - `path`: relative path in local workspace.
  - `source`: `"root" | "registry" | "generated"`.
  - if `source === "registry"`:
    - `ref`: dependency ref used to fetch (`@user/name@version` or `@org/team/name@version`; pinned recommended).
    - `originalPath`: path within the dependency bundle.
    - `contentHash` (optional): hash of the installed content at expansion time (used for dirty detection). If omitted/unknown, strict mode may skip dirty detection.

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

- `_deps/<namespace>/<name>/...`
- includes the dependency’s source files and a synthetic `index.tsx` that re-exports from a chosen entry file.

Version pinning:

- If the dependency ref includes a version (`@user/name@x.y.z` or `@org/team/name@x.y.z`), materialization SHOULD use that version.
- If ref is floating (`@user/name` or `@org/team/name`), materialization uses the current resolved version at build/install time.

### 3.3.4 Editing Dependency Files (Conflict Policy)

If a file with `source: "registry"` has a modified content hash at publish time (dirty):

The system MUST choose an explicit policy. In current publish flows, the default may remain strict, but product direction should treat this as **divergence classification**, not merely “error prevention”:

- **Strict (default)**: block root publish; instruct user to publish the dependency item instead, or revert changes.
- **Split publish**: publish updated dependency item(s) first, then publish root with updated pinned refs.
- **Inline vendor (explicit opt-in)**: allow vendoring dependencies into root (duplicate code) but must be recorded and discouraged.

The chosen policy must be user-visible and logged.

Normative clarification:

- dirty detection alone MUST NOT be described as “fork detection”.
- strict publish rejection is acceptable for registry integrity, but tooling SHOULD additionally expose whether the local copy appears `modified` vs `forked` for follow-up workflows.

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

- `provenance`: an object matching section 3.3.2 (or a subset that includes `files[]` with `source/ref` and optional `contentHash`).
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

## 3.5 Implicit Dependency Signals (Fallbacks)

This section defines AI-friendly fallback mechanisms that reduce the need for users to manually declare dependencies.

### 3.5.1 Provenance-derived Dependencies (Preferred)

If a publish payload includes provenance (section 3.4), dependency refs discovered via `source:"registry"` entries SHOULD be:

- merged into `registryDependencies` (deduped),
- treated as an explicit dependency signal for the published version.

### 3.5.2 Stub Scanning (Last-resort)

If provenance is not provided, the system MAY infer dependencies by scanning uploaded source files for known stub patterns.

Recommended stub signature:

- a leading marker comment (e.g. `auto-generated by cozy registry`), and
- a re-export into `_deps/<owner>/<name>/index`.

When a stub is detected, the system MUST:

- include inferred refs in publish **diagnostics** (e.g. `stubInferredRegistryDependencies`), and
- **not** add them to persisted `registryDependencies` unless the caller sets **`applyStubInference: true`** (opt-in merge).

Rationale: explicit `registryDependencies` remain the source of truth; stub inference is best-effort and must not silently change the stored graph.

Optional: callers MAY set `applyStubInference: true` to merge stub-inferred refs into the written `registryDependencies` (still deduped, never overriding explicit entries).

Notes:

- Stub scanning must be best-effort and MUST NOT be the only mechanism (it is less reliable than provenance).
- Stub scanning must not override explicit `registryDependencies` declarations; it only merges when opt-in.

---

## 3.6 Dependency suggestions (code analysis vs catalog)

This section defines **optional** tooling behavior: help users and agents discover likely registry links (e.g. Dialog uses Button) **without** silently persisting them.

### 3.6.1 Purpose

**Implementation (this repo):** MCP tool `suggest_registry_dependencies` performs read-only analysis of a `files` map (same shape as publish) against the scoped catalog from `getRegistryItemsScoped`, using static imports and optional cozy stub paths (`lib/registry-dependency-suggestions.ts`).

When a user creates or updates a component, tools MAY:

1. Analyze source (e.g. static import graph / AST).
2. Detect referenced symbols or import paths that may correspond to **other registry items**.
3. Match candidates against **existing registry items** the caller can see (e.g. via list/search APIs).
4. Emit **dependency suggestions** for human or agent review.

This pipeline is **orthogonal** to stub inference (§3.5.2): suggestions MUST NOT rely on stub patterns as the primary signal. Stub inference remains a separate, last-resort diagnostic.

### 3.6.2 Matching rules (v1)

Matching MAY use:

- **Component / file name** (e.g. `Button` → candidate `@owner/button`).
- **Import source** when present (e.g. bare specifier `@scope/button` or documented registry import convention).

Matching MUST:

- assign a **confidence** level and **reasons** (for transparency).

Matching MUST NOT:

- create **fuzzy implicit links** without user confirmation when multiple candidates exist;
- auto-persist suggestions as `registryDependencies`.

### 3.6.3 Suggestion shape (informative)

Tools MAY expose suggestions using a structure equivalent to:

```ts
type DependencySuggestion = {
  /** Local symbol or file-level hint, e.g. "Button" */
  name: string;
  /** Canonical ref, e.g. "@cozy/button" or "@acme/design-system/button" */
  registryItem: string;
  /** Resolved latest or chosen catalog version */
  latestVersion: string;
  confidence: "high" | "medium" | "low";
  /** Why this match was proposed */
  reasons: string[];
};
```

### 3.6.4 UI / agent behavior

Before persisting, the system MUST present suggestions in a way that allows an explicit choice, for example:

- **Use as registry dependency** (recommended when match is correct), or
- **Keep as local / inline** (no `registryDependencies` edge).

The **user** (or an agent acting on **explicit** user instruction) confirms the final `registryDependencies` array in the publish request.

### 3.6.5 Allowed smart defaults

If and only if tooling shows a confirmation step:

- **Pre-selecting** “use as registry dependency” MAY be used when confidence is **high** and there is a **single** unambiguous candidate.

This does not waive the requirement that the published payload explicitly contains the confirmed refs.

### 3.6.6 Integration with extraction pipelines

Downstream extractors MAY output:

```ts
type ExtractedComponent = {
  dependencies: {
    npm: Record<string, string>;
    registry: Array<{ name: string; version: string }>; // empty until confirmed
  };
  dependencySuggestions: DependencySuggestion[];
};
```

Flow: **extract → suggest → user confirms → finalize `registryDependencies` → publish**.

---

## 3.7 Publish-time dependency health (non-blocking)

### 3.7.1 Trigger

On publish or republish, tooling MAY compare each **pinned** registry dependency (`@user/name@version` or `@org/team/name@version`) against the **latest** resolvable version visible to the publisher.

### 3.7.2 Status

Informative status per edge:

- `up-to-date` — pinned version equals latest (or float resolves to current).
- `outdated` — newer version exists.
- `missing` — ref does not resolve.

### 3.7.3 UX rules

- **MUST NOT** block publish solely because dependencies are outdated.
- **MUST NOT** auto-upgrade pinned refs without explicit user choice.
- **SHOULD** show a clear summary, e.g. current vs latest, with actions:
  - **Continue with current** (default), or
  - **Upgrade to latest** (explicit opt-in; new pin written in the same publish or a follow-up).

Optional enhancements (non-normative): trigger preview rebuild, show diff.

---

## 3.8 Fingerprints and divergence detection

### 3.8.1 Purpose

The system needs a stable way to answer:

- Has this installed instance changed since install/upgrade?
- If yes, is it still a light modification or effectively a fork?

### 3.8.2 Baseline requirement (MVP)

At install time, tooling MUST capture an **original fingerprint** for each installed registry instance.

At status/sync time, tooling MUST recompute a **current fingerprint** and compare it with the baseline.

Minimum viable implementation:

- fingerprint algorithm: content hash over the installed source bundle as written locally
- comparison output: `same | changed`

### 3.8.3 Evolution path

Recommended progression:

1. v1: file/content-level fingerprint (stable hash)
2. v1.5: normalized bundle fingerprint (ignore ordering / trivial formatting where practical)
3. v2+: structure-aware fingerprint (e.g. AST-aware hashing)

The spec does not require AST-aware hashing for the MVP.

### 3.8.4 Classification guidance

Fingerprint mismatch indicates **divergence**. It does not by itself determine whether the instance is `modified` or `forked`.

Tooling MAY use additional heuristics, such as:

- changed file count / changed export surface
- significant path/layout rewrites
- inability to align with upstream entry structure
- explicit user “detach/fork” action

---

## 3.9 Change metadata (minimal contract)

Snapshot/version storage alone is insufficient for meaningful sync decisions. Tooling SHOULD support minimal change metadata describing upgrade intent/risk.

Suggested shape:

```json
{
  "changes": [
    {
      "type": "style | structure | behavior",
      "impact": "safe | risky | breaking",
      "description": "human-readable summary"
    }
  ]
}
```

Rules:

- This metadata MAY be system-generated, user-authored, or both.
- MVP implementations MAY omit it for older versions.
- Absence of change metadata MUST NOT block publish or resolution.
- Tooling SHOULD prefer coarse, reliable summaries over speculative precision.

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

## 4.4 Instance-level usage graph (directional, MVP-first)

`registryDependencies` defines the **declared item graph**. Sync workflows additionally need a **local instance graph** describing where and how installed items are used.

MVP expectation:

- track which installed local instance maps to which upstream registry ref/version
- track which local files belong to that instance
- surface whether the instance is `clean | modified | forked`

Future enhancement:

- record finer-grained file/import usage edges between project files and installed registry instances
- support richer impact analysis for selective sync

The MVP does **not** require a runtime execution graph.

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

- floating ref: `@user/name` or `@org/team/name` (tracks current version)
- pinned ref: `@user/name@x.y.z` or `@org/team/name@x.y.z` (immutable target)

Policy recommendation:

- preview/dev: floating allowed.
- production/stable bundles: pinned preferred.

Future enhancement:

- add policy flag to enforce pinned refs in specific environments.

---

## 7.1 Contract Versioning (v1 → v2)

This spec defines **Contract v1** as the current public surface:

- `registryDependencies: string[]` using `@user/name[@version]` or `@org/team/name[@version]`
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
      "ref": "@acme/design-system/button@1.2.0",
      "kind": "ui",
      "optional": false,
      "scope": "runtime"
    }
  ]
}
```

Fields:

- `ref` (required): `@user/name[@version]` or `@org/team/name[@version]`
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

Implementation test plan (layers, mapping, CI): [registry-dependency-test-plan.md](./registry-dependency-test-plan.md).

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

Phase 4 (sync MVP):

- persist install-time fingerprints for local instances.
- add instance status classification (`clean | modified | forked`).
- add CLI/MCP status command that reports divergence and upstream version drift.
- generate a sync/update plan instead of directly replacing local files.

Phase 5 (selective sync):

- add change metadata summaries for published versions.
- distinguish safe auto-apply candidates from review-required instances.
- explore structured merge/migration for high-confidence cases only.

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

### 11.5 Sync Planning (new boundary)

Responsibilities:

- compare installed-instance baseline vs current fingerprint
- classify `clean | modified | forked`
- compare installed upstream version vs latest/target version
- produce an update plan:
  - safe to auto-apply
  - review required
  - effectively detached/forked

Important:

- sync planning MUST be advisory-first for the MVP.
- “replace file” is not a sufficient mental model; the output should describe a migration/review plan, even when the implementation path initially remains file-based.

---

## 12. Long-term Data Hygiene (Soft Delete, Retention, Governance)

This section defines recommended operational rules so soft-delete and historical immutability do not degrade the system over time.

### 12.1 Separate “Resolvable” vs “Installable/Visible”

When an item/version must be removed from the product surface, prefer:

- **Soft delete / archive**: hide from browse/search and prevent new installs by default.
- Keep it **resolvable** for historical previews/builds so existing versions remain reproducible.

This avoids breaking dependency graphs and historical previews.

### 12.2 Hard Delete Rules

Hard delete SHOULD be rare and restricted:

- Allowed only when the item/version is **not referenced** by any `registryDependencies` in any version.
- If referenced, hard delete MUST be blocked unless a migration/replacement plan is applied.

### 12.3 Retention and Storage Tiering

Soft delete does not imply keeping all bytes “hot” forever.

Recommended:

- hot tier: recent and frequently accessed versions
- cold tier: older versions moved to cheaper storage (still retrievable for resolver/preview)
- optional purge: truly orphaned content (never referenced, never installed/previewed) after a long TTL

### 12.4 Reverse Index / Reference Tracking

To enforce deletion safety and enable governance:

- maintain a reverse index or materialized view for “who references whom”
- track reference counts per item/version
- expose dangling edges and cycles in diagnostics (see section 6)

### 12.5 Periodic Governance Jobs

Run periodic jobs (weekly/monthly) to report:

- dangling deps (refs that no longer resolve)
- orphan items/versions (no references, no installs, no recent access)
- largest storage consumers
- candidates for cold-tier migration

These reports keep the registry maintainable as it scales.

---

## 13. Compatibility Notes

- Existing items without `registryDependencies` remain valid.
- Missing dependencies should fail only when graph resolution is required by the execution path.
- This spec is backward compatible with existing schema and resolver utilities.

---

## 14. Agent and tooling guideline (one sentence)

**Treat registry dependencies as explicit, version-aware, and user-confirmed:** the system and agents MAY propose edges and flag drift, but MUST NOT silently decide, mutate stored dependencies, or substitute stub/provenance heuristics for declared refs at resolution time (see §1.1).
