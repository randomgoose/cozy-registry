Status: active
Owner: engineering
Last updated: 2026-03-28

# Platform Dev Setup

This document describes the current local-development shape for `cozy-platform`.

## Goals

- run the extracted platform host without booting the full Next.js app
- let Web consume the standalone platform host directly
- keep product APIs and auth-control under a single backend runtime

## Current Host

The platform host currently lives under:

- `apps/platform/app.ts`
- `apps/platform/server.ts`
- `platform/routes/*`

The host now uses `Hono` with `@hono/node-server`, while route handlers still keep standard `Request -> Response` signatures so the service layer stays framework-light.

## Local Start

Start the platform host with:

```bash
pnpm cozy-platform
```

Default port:

- `4000`

Override port with:

```bash
PORT=4100 pnpm cozy-platform
```

## Web Configuration

Web targets the standalone platform host with:

```bash
VITE_COZY_PLATFORM_BASE_URL=http://localhost:3000
```

Behavior:

- `apps/web` talks directly to `cozy-platform`
- browser requests include credentials and rely on the shared auth/session cookies
- there is no longer a Next compatibility fallback in the runtime path

## Current Platform Surface

The extracted host currently serves:

- `GET /health`
- `GET|POST /api/auth/*`
- `GET /auth-control/session`
- `GET /auth-control/me`
- `POST /auth-control/me/handle`
- `GET /auth-control/workspace/context`
- `GET /auth-control/team/resolve`
- `POST /auth-control/team/ensure-slug`
- `POST /auth-control/sign-in/*`
- `POST /auth-control/sign-up/*`
- `POST /auth-control/organization/*`
- `GET|POST /auth-control/api-key/*`
- `GET|POST /collections`
- `PATCH|DELETE /collections/:id`
- `GET|POST /collections/:id/items`
- `DELETE /collections/:id/items/:itemId`
- `GET|PUT|DELETE /apikeys/:id/policy`
- `GET /notifications`
- `PATCH /notifications/:id`
- `POST /notifications/mark-all-read`
- `GET /registry`
- `GET /registry/owned`
- `POST /registry/items`
- `GET /workspace/current`
- `GET /team/current/collaboration`
- `GET|DELETE|PATCH /registry/:owner/:name`
- `GET|POST /registry/:owner/:name/versions`
- `GET /r/...`
- `GET /preview/...`
- `GET|POST|DELETE|OPTIONS /mcp`
- `GET|POST|DELETE|OPTIONS /api/mcp`
- `GET|POST /api/oauth/authorize`
- `POST /api/oauth/token`
- `POST /api/oauth/register`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`
- `GET /api/well-known/oauth-authorization-server`
- `GET /api/well-known/oauth-protected-resource`

## Notes

- `GET /registry/owned` requires auth and optionally accepts `teamId`
- `cozy-platform` is now the only backend runtime for product APIs, auth-control, OAuth, and well-known metadata
- Web + Platform is the current deployment model
