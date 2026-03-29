# `@cozy/web`

This directory is the new Vite-powered Web host for Cozy.

Target stack:

- Vite
- React
- TanStack Router

Why:

- Vite development server and faster feedback loops
- a lighter Web host now that `cozy-platform` owns the backend boundary
- route composition without coupling product code to Next.js runtime APIs
- cleaner separation between Web UI and `cozy-platform`

Current state:

- bootable homepage and global shell
- route migration is complete and `apps/web` is the only Web host
- public homepage now renders from the new host and can read `cozy-platform /registry`
- `/sign-in`, `/sign-up`, `/post-auth`, `/accept-invitation`, and `/onboarding/handle` now render from `apps/web` and use `cozy-platform /auth-control/*`
- authenticated `/dashboard` now reads `cozy-platform /workspace/current` and `/registry/owned`
- `/workspace` now renders from `apps/web` and uses `cozy-platform /auth-control/*` for workspace mutations
- `/notifications` now renders from `apps/web` and reads `cozy-platform /notifications`
- `/t/:orgSlug/:teamSlug/{dashboard|projects|settings}` now renders from `apps/web`, resolves the compatibility access group through `cozy-platform /auth-control/*`, syncs active scope, and then renders the migrated surface in-place
- `/collections` and `/t/:orgSlug/:teamSlug/collections` remain as compatibility aliases that redirect into `/projects`
- `/docs` now renders directly from `apps/web`
- `/projects` now manages `cozy-platform /projects` and `/projects/:id/items`, including create, edit, delete, member access, and item removal
- `/registry` now browses the public registry catalog from `cozy-platform /registry`
- `/registry/:itemName`, `/registry/:owner/:name`, and `/preview/:owner/:name` now form a migrated view-only detail and preview chain on the new host
- `/publish` now submits through `cozy-platform /registry/items`
- `/settings` now hosts workspace, projects, project access management, migrated shell scope switching, and API key inventory/creation through `cozy-platform /auth-control/*`
- the migrated shell now uses `cozy-platform /auth-control/*` for session summary, sign-in/sign-up bootstrap, workspace scope switching, team route resolution, invitation acceptance, onboarding handle setup, workspace org mutations, and API key inventory/lifecycle

Runtime env vars:

- `VITE_COZY_PLATFORM_BASE_URL` points the new Web host at `cozy-platform`
- dev server default URL: `http://localhost:5173`

Recommended local start:

```bash
pnpm cozy-platform
pnpm cozy-web
```

Notes:

- route-level code splitting is enabled, so migrated routes now build as separate chunks
- the Web host now depends only on `cozy-platform`
- Next.js fallback pages, docs hosting, and auth/OAuth entrypoints have been removed from the runtime path

Planned migration order:

1. homepage and global shell
2. auth shell and dashboard reads
3. collections and registry browsing
4. item detail and preview entry points
5. publish and settings surfaces
