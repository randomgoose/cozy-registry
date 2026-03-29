Status: complete
Owner: engineering
Last updated: 2026-03-28

# Platform Client Guidelines

This document defines how Web code consumes the extracted platform boundary after the Next.js removal.

## Rule

Treat `apps/web` as a client of `cozy-platform`.

That means:

- page and component code in `apps/web` should use browser-side client helpers under `apps/web/src/lib/*`
- product and control-plane HTTP traffic should go directly to `cozy-platform`
- domain logic should continue to live in `packages/platform-services/*`, `packages/auth-control/*`, and other workspace packages
- do not reintroduce compatibility adapters under `app/api/*`

## Current Client Modules

- `apps/web/src/lib/platform.ts`
- `apps/web/src/lib/auth-control.ts`
- `apps/web/src/lib/runtime-config.ts`

## Request Strategy

The Web host runs in a single mode:

- `VITE_COZY_PLATFORM_BASE_URL` points to the standalone `cozy-platform` process
- browser-side requests go directly to that host with `credentials: "include"`

## Auth and Control Plane

The Web host should call:

- `apps/web/src/lib/platform.ts` for product data
- `apps/web/src/lib/auth-control.ts` for sign-in, session, workspace/access-group control, invitations, onboarding, and API key lifecycle

## Constraints

- do not call `lib/registry` or other domain modules directly from `apps/web` page components
- do not add new fallback logic to Next.js route handlers
- do not introduce direct `/api/auth/*` or `/api/me*` calls from `apps/web`

## End State

- Web pages use `apps/web/src/lib/platform.ts` and `apps/web/src/lib/auth-control.ts`
- `cozy-platform` is the source of truth for product APIs and auth-control flows
- Next.js compatibility routes are gone from the runtime path
