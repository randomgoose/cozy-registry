Status: active
Owner: engineering
Last updated: 2026-03-28
Source of truth: yes

# Repository Structure Guidelines

## Goal

This repository now follows a formal monorepo-style source layout:

- `apps/web`: the only Web host
- `apps/platform`: the only backend / control-plane host
- `packages/*`: shared modules grouped by subsystem

The goal of this layout is to keep runtime hosts thin and move product/domain logic into stable package boundaries.

## Current Top-Level Layout

```txt
apps/
  web/
  platform/
packages/
  auth-control/
  auth-runtime/
  db/
  extraction/
  mcp/
  oauth/
  platform-core/
  platform-services/
  preview/
  registry-domain/
  shared/
  thumbnail/
  tooling/
  ui/
bin/
assets/
docs/
turbo.json
```

## Responsibilities

### Root `bin/`

Use for:

- local dev entrypoints
- operational scripts
- one-off maintenance tools
- worker/process bootstrap commands

Examples:

- `cozy-dev`
- `cozy-web`
- `cozy-platform`
- `cozy-mcp`
- thumbnail worker and requeue tools

### `packages/db/migrations`

Use for:

- generated SQL migrations
- drizzle migration journal and snapshots

Keep schema/client runtime in `packages/db`, and keep migration artifacts under `packages/db/migrations`.

### Root `docs/`

Use for:

- product specs
- engineering plans
- architecture notes
- delivery checklists

This is the repository knowledge base, not user-facing runtime content.

### Root `assets/`

Use for:

- source design assets
- static source images used during authoring
- repository-level media that is not part of the runtime public URL contract

If an asset must be served directly by a runtime host, colocate it under that app instead of reviving a shared root static-assets directory.

### Root `turbo.json`

Use for:

- workspace task orchestration
- shared `build`, `dev`, `lint`, `typecheck`, and `test` task graph rules

Use root `pnpm turbo:*` scripts when you want to run host/package tasks across the monorepo.

### `apps/web`

Use for:

- routes
- page-level UI
- browser-only data access clients
- app shell and UX composition
- docs content owned by the web host, for example `apps/web/content/docs/*`
- docs runtime adapters that map content into routes, for example `apps/web/content/docs/runtime.tsx`

Do not put product domain logic here.

### `apps/platform`

Use for:

- Hono app wiring
- route adapters
- request/response translation
- host-level middleware

Keep route files thin. They should delegate to `packages/*`.

### `packages/platform-services`

Use for:

- application services consumed by `apps/platform`
- product-facing orchestration
- request-context-aware use cases

Examples:

- registry list/detail orchestration
- collections operations
- notifications reads/writes
- preview orchestration

### `packages/auth-control`

Use for:

- auth and workspace/team control-plane services
- request/session context helpers
- token/session bridging helpers
- workspace/team resolution logic

This package wraps the underlying auth engine behind our own control-plane boundary.

### `packages/auth-runtime`

Use for:

- Better Auth runtime configuration
- invitation notification helpers
- auth-host glue and email integration

### `packages/db`

Use for:

- Drizzle client runtime
- schema definitions

Repository-level migration and seed scripts live under `packages/db/scripts/*` and should import runtime pieces from `packages/db/*`.

### `packages/oauth`

Use for:

- OAuth authorization and token logic
- OAuth metadata generation
- refresh-token helpers

### `packages/registry-domain`

Use for:

- registry item domain reads/writes
- owner resolution
- publish target resolution
- publish contract normalization
- dependency graph / resolver logic
- registry dependency analysis helpers

### `packages/preview`

Use for:

- preview bundle building
- preview cache keys and cache helpers
- preview runtime message contracts
- prop control helpers

### `packages/tooling`

Use for:

- install protocol helpers
- source parsing and validation
- provenance helpers
- upload/publish analysis helpers

### `packages/ui`

Use for:

- shared UI primitives
- shadcn/base-ui component source
- reusable `components/ui/*`-style building blocks for app hosts

Prefer `@cozy/ui/components/*` imports from apps instead of local app-scoped UI copies.

### `packages/shared`

Use for:

- low-level shared utilities
- storage helpers
- UI utility functions

### `packages/platform-core`

Use for:

- platform request/session context primitives
- core types shared across platform-facing services

### `packages/mcp`

Use for:

- MCP server implementation
- server-side tool registration and orchestration glue

### `packages/extraction`

Use for:

- source extraction types and helpers

## Placement Rules

When adding new code, prefer this order:

1. If it is runtime host wiring, place it in `apps/web` or `apps/platform`.
2. If it is product/domain logic shared by hosts, place it in an existing `packages/*`.
3. If no existing package fits and the boundary is stable, create a new package directory under `packages/`.
4. Avoid re-introducing a root `lib/*` layer.

## Dependency Direction

Preferred direction:

```txt
apps/* -> packages/*
```

Allowed exceptions exist for tightly-coupled shared helpers, but avoid reversing this into package code that depends on host code.

The repository lint config now enforces a baseline version of this:

- `packages/*` cannot import `apps/*`
- `apps/web` cannot import `apps/platform`
- `apps/platform` cannot import `apps/web`
- new `@/lib/*` imports are disallowed

## Import Conventions

Use package-name imports for workspace package code:

- `@cozy/auth-control`
- `@cozy/auth-control/*`
- `@cozy/auth-runtime`
- `@cozy/auth-runtime/*`
- `@cozy/db`
- `@cozy/db`
- `@cozy/db/schema`
- `@cozy/oauth`
- `@cozy/oauth/*`
- `@cozy/platform-core`
- `@cozy/platform-core/*`
- `@cozy/platform-services`
- `@cozy/platform-services/*`
- `@cozy/preview`
- `@cozy/preview/*`
- `@cozy/registry-domain`
- `@cozy/registry-domain/*`
- `@cozy/shared`
- `@cozy/shared/*`
- `@cozy/thumbnail`
- `@cozy/thumbnail/*`
- `@cozy/tooling`
- `@cozy/tooling/*`
- `@cozy/ui`
- `@cozy/ui/components/*`

Avoid deep relative imports across package boundaries.

Prefer root imports when consuming a package's public API surface. Use subpath imports when you intentionally depend on a specific module.

## Monorepo Workflow

Common root-level commands:

- `pnpm dev`: start the local web + platform development processes
- `pnpm turbo:dev`: run workspace `dev` tasks in parallel
- `pnpm turbo:build`: run workspace builds through Turbo
- `pnpm turbo:typecheck`: run workspace typechecks through Turbo
- `pnpm turbo:lint`: run workspace lint tasks through Turbo
- `pnpm turbo:test`: run workspace test tasks through Turbo

Use direct `pnpm --filter <package>` commands when you need to target a single app or package.
- `@cozy/platform-services/*`
- `@cozy/preview/*`
- `@cozy/registry-domain/*`
- `@cozy/shared/*`
- `@cozy/thumbnail/*`
- `@cozy/tooling/*`

Use `@/*` only for app-root imports that do not belong to a workspace package.

## Package Evolution

Current `packages/*` directories are private pnpm workspace packages with minimal `package.json` files.

They are still source-level packages for now:

- no separate publish pipeline
- no independent build output
- package-name imports are resolved to workspace source during development and tests

We should only add richer per-package metadata when:

- a package needs independent build/test ownership
- it needs explicit workspace dependencies
- or we want to expose stable package-name imports
