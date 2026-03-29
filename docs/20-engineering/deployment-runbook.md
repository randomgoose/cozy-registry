Status: active
Owner: engineering
Last updated: 2026-03-28

# Deployment Runbook

This document describes the current production topology after the Next.js removal.

## Runtime Topology

The system now deploys as two services:

1. `apps/web`
   - Vite-built static Web host
   - serves the primary product UI

2. `cozy-platform`
   - Hono + Node server
   - serves product APIs, auth-control, OAuth, MCP, preview, and well-known metadata

Optional third process:

- thumbnail worker
  - handles asynchronous thumbnail generation

## Expected URLs

Example production layout:

- Web: `https://app.example.com`
- Platform: `https://platform.example.com`

Example local layout:

- Web: `http://localhost:5173`
- Platform: `http://localhost:3000`

## Required Environment Variables

### Shared / backend

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `APP_URL`
- `COZY_WEB_BASE_URL`
- `COZY_PLATFORM_BASE_URL`

### Web

- `VITE_COZY_PLATFORM_BASE_URL`

### Optional integrations

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `FIGMA_CLIENT_ID`
- `FIGMA_CLIENT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`

## Start Commands

### Local

```bash
pnpm cozy-platform
VITE_COZY_PLATFORM_BASE_URL=http://localhost:3000 pnpm cozy-web
```

### Build

```bash
pnpm build
```

### Web preview

```bash
pnpm web:build
pnpm web:preview
```

## Smoke Checklist

1. Open `/`
2. Sign in
3. Open `/dashboard`
4. Open `/projects`
5. Open `/registry`
6. Open one registry detail page
7. Open one preview page
8. Publish an item
9. Open `/settings`
10. Verify OAuth metadata:
    - `/.well-known/oauth-authorization-server`
    - `/.well-known/oauth-protected-resource`
11. Verify MCP endpoint:
    - `/mcp`
    - `/api/mcp`

## Rollback Boundary

If a deployment fails:

- keep `apps/web` deployed
- roll back `cozy-platform` independently
- Web should only be pointed at a healthy `VITE_COZY_PLATFORM_BASE_URL`
