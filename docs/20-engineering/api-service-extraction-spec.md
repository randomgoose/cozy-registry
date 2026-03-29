Status: proposed
Owner: engineering
Last updated: 2026-03-27
Source of truth: yes

# API / Service Extraction Spec

This document defines the near-term architecture plan to extract the product's API and service layer from the current Next.js monolith.

The goal is not microservices for their own sake. The goal is to make the system shape match the product shape:

- `cozy registry` is increasingly a **platform**
- Web is an important client, but not the only or primary architectural center
- MCP, preview/build, install/sync, and registry APIs are first-class product surfaces

---

## Related Docs

- [System Architecture](../00-overview/system-architecture.md): current monolith structure
- [System Overview](../00-overview/system-overview.md): current modules and data flow
- [Platform Client Guidelines](./platform-client-guidelines.md): current client-side migration rules
- [Platform Compatibility Adapters](./platform-compatibility-adapters.md): temporary Next adapter inventory
- [Platform Boundary Audit](./platform-boundary-audit-2026-03-27.md): current classification of remaining `/api/*` usage
- [Preview Build Performance Spec](./preview-build-performance-spec.md): preview-specific performance plan
- [Registry Dependency Management Spec](./registry-dependency-management-spec.md): dependency graph, provenance, sync direction
- [Install Protocol](./install-protocol.md): project-side install and lockfile contract

---

## Current Status

As of 2026-03-27, the extraction work has reached a stable in-repo platform boundary milestone.

Implemented:

- platform request/session context abstraction under `lib/platform-context.ts` and `lib/platform-auth.ts`
- extracted service layer under `packages/platform-services/*`
- standalone Node-native platform host under `platform/*`
- platform clients under `lib/platform-client/*`
- thin compatibility adapters across the main `app/api/*` product surfaces
- migrated Web reads and selected writes for registry, collections, notifications, workspace, team collaboration, and API key policy
- test coverage for platform client fallback, platform route dispatch, and key service behaviors

Current tests:

- `pnpm test` passes with 51 tests green

Still intentionally outside the platform boundary:

- auth/session/profile routes
- organization/team management writes
- local utility endpoints such as highlight and health

This means the current phase should be treated as structurally complete, with follow-up work focused on compatibility cleanup, route deprecation planning, and broader regression coverage rather than more large-scale boundary moves.

---

## 1. Problem Statement

The current application is a successful monolith, but its deployment and development model now creates friction:

1. Web development is slowed by the current Next.js-centric full-stack workflow.
2. Platform capabilities are expressed as Next routes instead of as explicit service interfaces.
3. MCP, preview/build, registry read/write APIs, and OAuth/policy live inside the same host application as the Web UI.
4. Future private deployment would be harder if core capabilities remain coupled to a Web framework host.

The monolith is not the problem by itself. The issue is that the product's core capabilities are becoming platform services, while the implementation still treats them as Web-app internals.

---

## 2. Goals

This extraction work MUST achieve the following:

1. Make platform capabilities independently deployable from the Web UI.
2. Preserve the existing domain logic and contracts wherever possible.
3. Reduce framework coupling for core registry logic.
4. Improve long-term support for:
   - MCP and AI clients
   - preview/build services
   - CLI / IDE / external tool integrations
   - private/self-hosted deployment
5. Allow the Web front end to evolve independently of the platform backend.

Non-goals for the first phase:

- full microservice decomposition
- rewriting all domain logic
- redesigning all public APIs
- changing data model fundamentals
- immediately replacing every Next.js page

---

## 3. Product Surfaces That Must Become Explicit

The extracted platform layer is responsible for the following first-class surfaces:

### 3.1 Registry API

Includes:

- list / search / fetch registry items
- fetch shadcn-compatible registry item JSON
- publish item
- publish version
- version history
- delete / collection / policy-aware access

### 3.2 Preview Service

Includes:

- preview HTML route
- preview build orchestration
- dependency resolution for preview
- preview diagnostics and debug output

### 3.3 MCP Surface

Includes:

- read tools
- publish/update/delete tools
- install/check/upgrade tools
- token/policy-scoped access

### 3.4 Auth / Policy Surface

Includes:

- API token validation
- OAuth metadata / authorize / token endpoints
- session-to-policy resolution where needed
- workspace/team/collection access decisions

### 3.5 Background Jobs

Includes:

- thumbnail generation
- future sync/analysis/background maintenance tasks

---

## 4. Why Extraction Has Special Value For Cozy Registry

This product is not just a Web app with some APIs. It is becoming a registry platform with multiple clients.

Extraction creates value in five specific ways:

### 4.1 Product shape matches architecture

Web becomes one client of the platform instead of the host environment for the whole product.

### 4.2 MCP and AI flows become first-class

MCP is no longer “a route inside the Web app”; it becomes part of the actual platform surface.

### 4.3 Preview/build can evolve like a service

Preview performance, caching, concurrency, and worker behavior become easier to reason about when preview is treated as a service, not a page-side implementation detail.

### 4.4 Frontend framework choice becomes independent

Once Web depends on a service boundary, the team can keep Next, move to TanStack Start, or move to Vite React without redefining the entire platform.

### 4.5 Private deployment becomes realistic

A containerized platform service plus a Web client is much more deployable in self-hosted environments than a product whose core behavior is inseparable from a specific hosted full-stack framework.

---

## 5. Target Architecture

The recommended medium-term target is **two deployable systems**, not many microservices.

### 5.1 `cozy-platform`

Owns:

- Registry API
- `/api/r/...` registry consumption endpoints
- Preview service routes
- MCP endpoint
- OAuth / token / policy endpoints
- background jobs
- domain logic adapters

### 5.2 `web-console`

Owns:

- dashboard
- publish UI
- collections / settings / workspace pages
- component browsing and management UI
- docs, if convenient

### 5.3 Shared dependencies

Shared services remain external and standard:

- PostgreSQL
- optional S3-compatible object storage
- optional queue / job backend later

### 5.4 Why not split further yet

Do **not** initially split into:

- registry-api
- preview-service
- mcp-service
- oauth-service

That would increase coordination and ops overhead too early. The first architectural win is to separate **platform** from **Web**, not to maximize service count.

---

## 6. Boundary Rules

### 6.1 What MUST stay framework-neutral

The following modules SHOULD remain platform-neutral and reusable:

- `lib/registry.ts`
- `lib/registry-resolver.ts`
- `lib/registry-graph.ts`
- `lib/install-protocol.ts`
- `lib/preview-build.ts`
- `lib/registry-publish-contract.ts`
- `lib/registry-dependency-*`
- `lib/mcp-tools.ts` business logic, as much as practical

These modules may depend on:

- TypeScript
- Drizzle
- Postgres
- esbuild
- standard Node APIs

They SHOULD NOT depend directly on:

- Next.js route/runtime APIs
- `next/headers`
- `next/navigation`
- `NextResponse`
- page/layout semantics

### 6.2 What may remain adapter-specific

The following are transport/UI adapters and may be rewritten:

- `app/api/**`
- `app/preview/**`
- `app/**/page.tsx`
- `app/**/layout.tsx`
- any request/session glue specific to Next

### 6.3 Adapter rule

Transport layers should be thin:

- parse request
- authenticate / attach context
- call domain/service function
- map result to HTTP response

No new domain logic should be added to framework adapters unless unavoidable.

---

## 7. Recommended Migration Strategy

### Phase 0: Boundary cleanup inside the monolith

Before extraction, continue moving logic out of Next-specific files.

Required work:

- keep domain logic in `lib/`
- reduce use of `next/headers` and `NextResponse` outside adapters
- keep preview/build logic independent of page/render internals

This phase reduces migration risk even if the actual extraction starts later.

### Phase 1: Create a platform service host

Introduce a new service host, likely using a lightweight HTTP framework such as Hono.

The service host should expose:

- registry read routes
- publish/version routes
- preview routes
- MCP routes
- OAuth/token routes

The initial host MAY live in the same repo.

### Phase 2: Move Web to consume the platform

The Web app should stop calling local route handlers as its source of truth and instead consume the platform service boundary.

This may happen:

- through internal HTTP calls, or
- through shared server-side client modules

The key requirement is architectural: Web is a client of the platform.

### Phase 3: Extract workers

Move background job execution into a worker process or service that consumes the same shared domain modules and database.

### Phase 4: Decide Web framework independently

Only after the platform boundary is stable should the team decide whether to:

- keep Next.js for Web
- move to TanStack Start
- move to Vite React + service API

This decision should no longer affect platform architecture.

---

## 8. Deployment Implications

### 8.1 Hosted SaaS

Recommended medium-term shape:

- `web-console` can live on a frontend-optimized host
- `cozy-platform` can live on a service/container host
- Postgres remains managed

### 8.2 Private deployment

Private deployment is a strategic reason to perform this extraction.

The platform layer should be designed to run in standard environments:

- Docker / Compose first
- Kubernetes later
- standard Node runtime
- standard Postgres
- optional S3-compatible storage

### 8.3 Platform-neutral design rule

The platform MUST NOT depend on vendor-specific runtime assumptions if private deployment is a real product goal.

In practice this means avoiding hard dependence on:

- Vercel-only request/runtime behavior
- Cloudflare Workers-only storage/runtime models
- framework-owned background execution assumptions

---

## 9. Operational Model

### 9.1 First deployment shape

Recommended first extracted deployment:

- one `cozy-platform` process
- one `web-console` process
- one Postgres
- optional one worker process

This is intentionally simple.

### 9.2 Auth model

The extraction must preserve these access models:

- browser session access
- API token access
- MCP token/policy access
- team/workspace/collection scope checks

Auth is expected to become more explicit and slightly more complex. That is acceptable and should be treated as part of platform hardening.

### 9.3 Internal communication

The first extracted version does not require service mesh or async choreography.

Synchronous HTTP + shared database is sufficient for the first phase.

---

## 10. Risks

### 10.1 Short-term delivery slowdown

Any extraction creates a temporary slowdown while adapters are moved and contracts are clarified.

### 10.2 Auth/session complexity

Moving from a monolith to a platform boundary makes session and token handling more explicit and therefore more work.

### 10.3 Dual-path maintenance

During migration there may be a period where both:

- old Next routes
- new platform routes

must coexist. This should be treated as transitional and minimized.

### 10.4 Premature over-splitting

Too many services too early would make the product harder to evolve. Keep the first split coarse-grained.

---

## 11. Acceptance Criteria

This extraction direction is considered established when all of the following are true:

1. There is a documented `cozy-platform` boundary separate from Web UI concerns.
2. Core registry, preview, MCP, and auth/policy capabilities are callable through that platform boundary.
3. The Web app can be treated as a client of the platform rather than its host.
4. Core domain modules no longer depend on Next-specific request/runtime APIs.
5. The platform can plausibly be containerized and self-hosted without redesigning core logic.

---

## 12. Implementation Guidance

Suggested first extraction candidates:

### Highest priority

- preview routes and preview/build orchestration
- MCP endpoint
- registry read/write API

### Medium priority

- OAuth/token routes
- collection/policy routes

### Later

- full Web app framework migration
- docs separation

---

## 13. Immediate Next Steps

1. Keep tightening the `lib/` boundary and avoid adding new Next-specific logic to domain modules.
2. Define the initial `cozy-platform` route surface and auth context shape.
3. Move preview and registry API adapters behind that new host.
4. Move Web to consume the platform boundary.
5. Only then decide whether Web should remain on Next or move elsewhere.

---

## 14. Execution Checklist

This section is the implementation-oriented breakdown intended for coding agents.

### 14.1 Agent A: Boundary Cleanup / Context

Goal: finish Phase 0 and make core modules safe to reuse from a non-Next host.

Tasks:

1. Audit and classify Next-bound modules:
   - `lib/collection-scope.ts`
   - `lib/auth-api.ts`
   - `lib/mcp-tools.ts`
   - `app/api/registry/items/route.ts`
   - `app/api/registry/[owner]/[name]/versions/route.ts`
   - `app/preview/[owner]/[name]/route.ts`
2. Introduce a shared platform request context module:
   - recommended new file: `lib/platform-context.ts`
3. Split request/session extraction from auth/policy resolution:
   - keep request parsing adapter-specific
   - keep policy resolution platform-safe
4. Ensure no new domain logic is added to Next adapters during this phase.

Deliverables:

- platform-safe request context type(s)
- clear separation between auth glue and auth logic
- notes on remaining Next-specific coupling

Acceptance:

- core service code can receive a generic context object instead of reaching into Next APIs directly

### 14.2 Agent B: Platform Host Skeleton / Registry API

Goal: introduce the first `cozy-platform` host and migrate registry API routes.

Tasks:

1. Create a new platform host directory:
   - recommended: `platform/` or `services/platform/`
2. Add host entrypoints and route registration:
   - `apps/platform/server.ts`
   - `apps/platform/app.ts`
   - `platform/routes/health.ts`
   - `platform/routes/registry.ts`
3. Move these capabilities behind the platform host:
   - list/search registry items
   - fetch item
   - fetch versions
   - publish item
   - publish version
   - `/api/r/...` consumption endpoints
4. Add a service orchestration layer:
   - recommended file: `packages/platform-services/registry-service.ts`

Reference source routes:

- `app/api/registry/route.ts`
- `app/api/registry/[owner]/[name]/route.ts`
- `app/api/registry/[owner]/[name]/versions/route.ts`
- `app/api/r/[owner]/[name]/route.ts`
- `app/api/r/[...spec]/route.ts`

Acceptance:

- platform host can serve functionally equivalent registry routes
- route handlers remain thin adapters

### 14.3 Agent C: Preview Extraction

Goal: make preview a platform capability rather than a Next-only route.

Tasks:

1. Extract preview orchestration into a service layer:
   - recommended file: `packages/platform-services/preview-service.ts`
2. Add preview routes to the platform host:
   - recommended file: `platform/routes/preview.ts`
3. Preserve existing preview query semantics:
   - `v`
   - `thumbnail`
   - `debugTheme`
   - `debugDeps`
4. Reuse existing domain modules where possible:
   - `lib/preview-build.ts`
   - `lib/registry-resolver.ts`
5. Align with the Preview Build Performance Spec during extraction where practical.

Reference source route:

- `app/preview/[owner]/[name]/route.ts`

Acceptance:

- preview can be served by the platform host with equivalent behavior
- no preview-specific business logic remains trapped in a Next route

### 14.4 Agent D: MCP Extraction

Goal: move MCP behind the platform host while preserving existing tool contracts.

Tasks:

1. Add MCP route(s) to the platform host:
   - recommended file: `platform/routes/mcp.ts`
2. Keep `lib/mcp-tools.ts` as the main MCP business-logic module
3. Adjust MCP server creation so it can consume the shared platform context and request adapter model

Reference source route:

- `app/api/mcp/route.ts`

Acceptance:

- MCP endpoint runs from the platform host
- existing tool behavior remains equivalent

### 14.5 Agent E: Web As Client

Goal: make the Web app consume the platform boundary rather than acting as the platform host.

Tasks:

1. Introduce a platform client layer:
   - recommended directory: `lib/platform-client/`
   - recommended files:
     - `lib/platform-client/client.ts`
     - `lib/platform-client/registry.ts`
     - `lib/platform-client/preview.ts`
2. Make key pages/components use the platform boundary:
   - `app/page.tsx`
   - `app/registry/[owner]/[name]/page.tsx`
   - `app/(auth)/dashboard/page.tsx`
   - `app/(auth)/collections/page.tsx`
   - `app/components/PreviewFrame.tsx`
   - `app/components/ComponentCard.tsx`
3. Add configuration for an external platform base URL.

Acceptance:

- Web can point to an external `cozy-platform` host
- platform communication is centralized instead of scattered

### 14.6 Agent F: Worker / Background Jobs

Goal: ensure background jobs can run independently of the Web host.

Tasks:

1. Audit and isolate worker-safe modules:
   - `bin/cozy-thumbnail-worker.ts`
   - `bin/cozy-thumbnail-requeue-all.ts`
   - `lib/thumbnail-jobs.ts`
   - `lib/thumbnail.ts`
2. Ensure workers depend only on:
   - Node runtime
   - database
   - shared platform-safe modules
3. Prepare workers to run as independent processes.

Acceptance:

- worker entrypoints are deployable outside the Next host

### 14.7 Suggested Execution Order

Recommended order:

1. Agent A first
2. Agents B, C, D in parallel once shared context direction is clear
3. Agent E after platform routes stabilize
4. Agent F in parallel or slightly later

### 14.8 Universal Constraints For All Agents

Rules:

- prefer extraction over redesign
- keep transport adapters thin
- do not casually rewrite domain contracts
- do not mix UI refactors into platform extraction
- preserve existing route semantics unless explicitly agreed
- document remaining framework coupling if not fully removed

### 14.9 Per-agent Required Output

Each agent should provide:

1. code changes
2. a short summary of:
   - what boundary was improved
   - what still remains framework-coupled
   - what the next agent should know

---

## 15. One-sentence rule

**Treat Cozy Registry as a platform with a Web client, not as a Web app with attached APIs.**
