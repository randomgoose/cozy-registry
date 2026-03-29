Status: complete
Owner: engineering
Last updated: 2026-03-28

# Web Framework Migration Plan

This document records the completed replacement of the old Next.js Web host with a Vite-powered Web stack.

## Decision

The target Web stack is:

- Vite
- React
- TanStack Router

Why this choice:

- it uses Vite for a faster local feedback loop
- it fits the new architecture where Web is a client of `cozy-platform`
- it keeps route-level navigation and data composition explicit instead of coupling the product to Next-specific runtime APIs
- it avoids the higher Node/runtime coupling we hit with TanStack Start in the current environment

## Final Structure

The repository now runs as:

```txt
apps/
  web/
platform/
lib/
```

In this shape:

- `apps/web` is the primary Web host
- `platform/` is the standalone backend and control-plane host
- Next.js runtime code has been removed from the product path

## Current Scaffold

The initial Vite + React + TanStack Router scaffold now lives in:

- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/router.tsx`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/index.tsx`

Current surface:

- the public homepage now renders from `apps/web`
- the new homepage can read the public registry catalog from `cozy-platform /registry`
- `/sign-in`, `/sign-up`, `/post-auth`, `/accept-invitation`, and `/onboarding/handle` now render from `apps/web`
- `/dashboard` now renders from `apps/web` and reads authenticated data from `cozy-platform /workspace/current` and `cozy-platform /registry/owned`
- `/workspace` and `/notifications` now render from `apps/web`
- the migrated shell now includes its own workspace scope switcher, backed by `cozy-platform /auth-control/*`
- `/t/:orgSlug/:teamSlug/{dashboard|collections|settings}` now render from `apps/web`; the route first resolves the team and syncs active scope through `cozy-platform /auth-control/*`, then shows the migrated page
- `/docs` now renders from `apps/web` directly
- `/collections` now renders from `apps/web` and manages `cozy-platform /collections` plus `cozy-platform /collections/:id/items`
- `/registry` now renders from `apps/web` and reads the public catalog from `cozy-platform /registry`
- `/registry/:itemName`, `/registry/:owner/:name`, and `/preview/:owner/:name` now render from `apps/web`
- `/publish` now renders from `apps/web` and posts to `cozy-platform /registry/items`
- `/settings` now renders from `apps/web` with migrated team collaboration management, workspace and collections overview, plus API key inventory/creation through `cozy-platform /auth-control/*`
- the migrated Web host now reaches session, sign-in/sign-up bootstrap, organization/team control, onboarding handle setup, and API key flows through `cozy-platform /auth-control/*`
- route-level code splitting is enabled in `apps/web`, so migrated surfaces now emit separate Vite chunks instead of a single oversized client bundle
- links for homepage catalog cards, dashboard item cards, migrated settings navigation, and migrated registry browsing now stay inside `apps/web`
- local dev now runs only `apps/web` and `cozy-platform`

## Follow-up

Next implementation steps:

1. remove any remaining historical documentation that assumes a Next fallback
2. keep strengthening `platform/` as the single backend/control-plane host
3. decide later whether auth-control should stay inside `platform` or split into its own service
