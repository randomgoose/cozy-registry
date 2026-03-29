Status: draft
Owner: engineering
Last updated: 2026-03-27

# Platform Compatibility Adapters

This document tracks the temporary Next route handlers that still exist while Web migrates onto the extracted platform boundary.

## Intent

These routes are compatibility adapters.

They should:

- parse the incoming request
- build platform auth/request context
- delegate to `packages/platform-services/*` or `packages/auth-control/*`
- map the service result back to `NextResponse` or `Response`

They should not become the long-term home for new domain behavior.

## Current Adapter Surface

Registry compatibility routes:

- `app/api/notifications/route.ts`
- `app/api/notifications/[id]/route.ts`
- `app/api/notifications/mark-all-read/route.ts`
- `app/api/workspace/current/route.ts`
- `app/api/team/current/collaboration/route.ts`
- `app/api/apikeys/[id]/policy/route.ts`
- `app/api/collections/route.ts`
- `app/api/collections/[id]/route.ts`
- `app/api/collections/[id]/items/route.ts`
- `app/api/collections/[id]/items/[itemId]/route.ts`
- `app/api/registry/route.ts`
- `app/api/registry/items/route.ts`
- `app/api/registry/lookup/route.ts`
- `app/api/registry/owned/route.ts`
- `app/api/registry/[owner]/[name]/route.ts`
- `app/api/registry/[owner]/[name]/versions/route.ts`

Other platform compatibility routes:

- `app/api/r/[owner]/[name]/route.ts`
- `app/api/r/[...spec]/route.ts`
- `app/api/mcp/route.ts`
- `app/preview/[owner]/route.ts`
- `app/preview/[owner]/[name]/route.ts`

## Removal Criteria

A compatibility route becomes removable when all of the following are true:

- the equivalent capability exists under `platform/routes/*`
- Web reads or writes use `lib/platform-client/*` instead of hardcoded local fetches
- the deployment environment provides `COZY_PLATFORM_BASE_URL` or `NEXT_PUBLIC_COZY_PLATFORM_BASE_URL` where needed
- no external caller still depends on the Next route as the primary endpoint

## Current Recommendation

While migration is in progress:

- keep compatibility routes thin
- do not add new domain rules directly in `app/api/*`
- prefer extending `packages/platform-services/*` or `packages/auth-control/*` first
- if Web needs a stopgap endpoint, add the smallest adapter possible and document it here
- do not treat auth/session/org-management endpoints as automatic platform candidates

## Next Cleanup Pass

The next cleanup pass should focus on:

- auditing whether any browser-side code still hardcodes local `app/api/*` paths
- deciding which compatibility routes need deprecation notes for external consumers
- deleting adapters only after the external platform host is the default production path
