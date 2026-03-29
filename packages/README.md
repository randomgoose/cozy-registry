# Packages

Shared backend logic now lives under `packages/`.

Each top-level directory in `packages/` is now a private pnpm workspace package with its own minimal `package.json`.

- `platform-services/`: product-facing application services used by `apps/platform`
- `auth-control/`: auth and workspace/team control-plane application services
- `auth-runtime/`: Better Auth runtime, invitation notifications, and auth-host glue
- `oauth/`: OAuth authorization, token, refresh, and metadata helpers
- `db/`: shared Drizzle client and schema runtime
- `registry-domain/`: registry owner, item, dependency, and publish domain logic
- `preview/`: preview bundle building, cache, and runtime message helpers
- `thumbnail/`: thumbnail generation and job-processing logic
- `ui/`: shared shadcn/base-ui primitives and UI component source
- `tooling/`: shared parsing, install protocol, provenance, and publish-analysis helpers
- `shared/`: low-level shared utilities such as storage and UI utility functions
- `platform-core/`: core request/session context primitives used across platform packages
- `mcp/`: MCP server implementation and server-side tool surface
- `extraction/`: source extraction types and helpers

Common examples in `auth-control/`:

- request/session context helpers
- workspace and team resolution helpers
- control-plane services that wrap the underlying auth engine

Import these packages by workspace name, for example:

- `@cozy/platform-services`
- `@cozy/platform-services/registry-service`
- `@cozy/auth-control`
- `@cozy/auth-control/platform-auth`
- `@cozy/ui`
- `@cozy/ui/components/button`
- `@cozy/db/schema`

These packages are source-level workspace directories inside the same repository. They are not published packages.

Each workspace package now also exposes a root `.` export for stable barrel-style imports. Prefer:

- package root imports for package-level APIs and app wiring
- subpath imports when you intentionally want a narrow module dependency
