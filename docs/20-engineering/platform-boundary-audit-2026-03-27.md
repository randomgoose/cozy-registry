Status: draft
Owner: engineering
Last updated: 2026-03-27

# Platform Boundary Audit

This document records the current state of `/api/*` usage after the API/service extraction work completed its main migration passes.

## Summary

At this point, most product-surface APIs that belong to the extracted platform have been moved behind:

- `packages/platform-services/*`
- `platform/routes/*`
- `lib/platform-client/*`

The remaining direct `/api/*` calls in `app/` mostly belong to auth, session, and organization-management concerns rather than the platform service boundary.

## Current Classification

### Keep In Platform Boundary

These capabilities now belong to the extracted platform layer:

- registry catalog, item detail, item versions, publish, delete, visibility
- `/r/...` consumption endpoints
- preview routes
- MCP HTTP surface
- collections
- notifications
- workspace current
- team current collaboration
- API key policy

These already have platform host coverage and should keep evolving through:

- `packages/platform-services/*`
- `platform/routes/*`
- `lib/platform-client/*`

### Keep In Auth / Web Host Layer

These are still intentionally served by the Next/auth host:

- `/api/auth/[...all]`
- `/api/auth/organization/create`
- `/api/auth/organization/create-team`
- `/api/auth/organization/set-active`
- `/api/auth/organization/set-active-team`
- `/api/auth/organization/invite-member`
- `/api/auth/organization/cancel-invitation`
- `/api/auth/organization/update-member-role`
- `/api/auth/organization/remove-team-member`
- `/api/auth/organization/update`
- `/api/auth/organization/update-team`
- `/api/auth/organization/delete`
- `/api/auth/organization/accept-invitation`
- `/api/team/ensure-slug`
- `/api/me`
- `/api/me/handle`

Reason:

- these endpoints are tightly coupled to interactive session state
- they mutate org/team membership or identity profile state
- they are currently part of the auth and workspace-management experience, not the registry platform surface

They may eventually be refactored for code quality, but they are not priority targets for `cozy-platform`.

### Keep As Utility / Local Web Endpoints

These are not platform-service targets:

- `/api/highlight`
- `/api/health`

Reason:

- `highlight` is a local rendering utility for the Web UI
- `health` is an environment/debug endpoint for the current host

## Remaining Direct `/api/*` Usage In `app/`

The remaining direct calls in `app/` fall into four buckets:

1. Auth/session profile

- `app/(auth)/onboarding/handle/page.tsx`
- `app/publish/page.tsx`

These use:

- `/api/me`
- `/api/me/handle`

2. Organization/team/session switching

- `app/(auth)/SidebarWorkspaceSection.tsx`
- `app/components/WorkspaceScopeSwitcher.tsx`
- `app/(auth)/dashboard/RouteWorkspaceSync.tsx`

These use:

- `/api/auth/organization/set-active`
- `/api/auth/organization/set-active-team`
- `/api/auth/organization/create`
- `/api/auth/organization/create-team`
- `/api/auth/organization/add-team-member`
- `/api/team/ensure-slug`

3. Organization/team management writes

- `app/(auth)/settings/page.tsx`
- `app/(auth)/workspace/page.tsx`
- `app/(auth)/accept-invitation/page.tsx`

These use:

- `/api/auth/organization/invite-member`
- `/api/auth/organization/cancel-invitation`
- `/api/auth/organization/update-member-role`
- `/api/auth/organization/remove-team-member`
- `/api/auth/organization/update-team`
- `/api/auth/organization/update`
- `/api/auth/organization/delete`
- `/api/auth/organization/accept-invitation`

4. Intentional path strings rather than runtime coupling

- `app/page.tsx` references `/api/health` and `/api/mcp`
- `app/components/ComponentCard.tsx` and registry detail surfaces still show `/api/r/...` install paths

These are expected because they represent public HTTP endpoints or helpful debug links, not an internal data-fetch coupling problem.

## Recommendation

For the next phase:

- continue migrating only product-surface APIs that clearly belong to `cozy-platform`
- do not migrate auth/session/org-management writes just for symmetry
- keep documenting compatibility adapters until external platform hosting becomes the default production path

## Exit Criteria For This Phase

This extraction phase should be considered structurally complete when:

- product-surface reads and writes use `lib/platform-client/*`
- Next compatibility routes stay thin
- remaining `/api/*` calls are mostly auth/session or utility endpoints
- new platform behavior is no longer added directly under `app/api/*`

## Stabilization Status

The repository currently satisfies that bar.

Verification snapshot from 2026-03-27:

- `pnpm exec tsc --noEmit` passes
- `pnpm test` passes
- platform client, platform app dispatch, and key platform services now have dedicated Vitest coverage
