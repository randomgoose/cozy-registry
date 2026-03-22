# figma-oauth-smoke

Minimal **[Hono](https://hono.dev) on [Vercel](https://vercel.com)** to isolate **Figma Make custom MCP + OAuth** from your main app.

## What it implements

- `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` (via `vercel.json` rewrites → `api/meta/*`)
- OAuth **authorization code** + **PKCE** (`/api/oauth/authorize`, `/api/oauth/token`)
- **Stateless signed codes/tokens** (no DB; safe across serverless instances)
- MCP Streamable HTTP at **`/api/mcp`** with one tool `ping` (same transport patterns as a typical MCP OAuth smoke test)

## Deploy

```bash
cd figma-oauth-smoke
pnpm install
vercel
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OAUTH_CODE_SIGNING_SECRET` | **Yes (prod)** | Long random string; signs auth codes and access tokens |
| `OAUTH_CLIENT_ID` | No | Default `cozy-figma-make` (match Figma Advanced settings) |
| `OAUTH_CLIENT_SECRET` | No | If set, token exchange still allows PKCE-only (Figma-style) unless wrong secret is sent |

## Figma Make

1. **MCP server URL:** `https://<your-deployment>/api/mcp`
2. **Authentication:** OAuth 2.0 or “OAuth with client credentials” per Figma’s table; use the same **Client ID** (and optional **secret**) as env above.
3. **Callback** is always Figma’s: `https://www.figma.com/oauth/mcp/callback` (hardcoded in `oauth-config.ts`).

Authorize screen has **no real login** — click **Authorize** to issue a code (smoke only).

## Local dev

```bash
pnpm dev
```

Uses `vercel dev` (install Vercel CLI if needed).

## Repo layout

- `api/[[...slug]].ts` — Hono entry for `/api/**`
- `api/meta/as.ts`, `api/meta/prm.ts` — metadata JSON
- `src/app.ts` — routes
- `src/mcp.ts` — MCP + Bearer verification
