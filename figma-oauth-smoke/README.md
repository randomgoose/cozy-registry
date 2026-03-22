# figma-oauth-smoke

Minimal **[Next.js](https://nextjs.org) on [Vercel](https://vercel.com)** to isolate **Figma Make custom MCP + OAuth** from your main app.

## What it implements

- `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` (Next.js `rewrites` in `next.config.ts` → `/api/meta/*`)
- OAuth **authorization code** + **PKCE** (`/api/oauth/authorize`, `/api/oauth/token`)
- **Stateless signed codes/tokens** (no DB; safe across serverless instances)
- MCP Streamable HTTP at **`/api/mcp`** with one tool `ping`

## Deploy

```bash
cd figma-oauth-smoke
pnpm install
pnpm build   # optional sanity check
vercel --prod
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OAUTH_CODE_SIGNING_SECRET` | **Yes (prod)** | Long random string; signs auth codes and access tokens |
| `OAUTH_CLIENT_ID` / `OAUTH_FIGMA_CLIENT_ID` | No | Same as main app env names; default `cozy-figma-make`. **Must match** Figma Advanced Client ID. |
| `OAUTH_CLIENT_SECRET` / `OAUTH_FIGMA_CLIENT_SECRET` | No | If set, must match Figma; PKCE-only still allowed when Figma omits secret. |

## Figma Make

1. **MCP server URL:** `https://<your-deployment>/api/mcp`
2. **Authentication:** OAuth 2.0 or “OAuth with client credentials” per Figma’s table; use the same **Client ID** (and optional **secret**) as env above.
3. **Callback** is always Figma’s: `https://www.figma.com/oauth/mcp/callback` (hardcoded in `src/lib/oauth-config.ts`).

Authorize screen has **no real login** — click **Authorize** to issue a code (smoke only).

## Local dev

```bash
pnpm dev
```

Runs `next dev` (default port 3000).

## Repo layout

- `src/app/api/**/route.ts` — Route Handlers (health, OAuth, MCP, metadata)
- `src/lib/*` — crypto, PKCE, MCP transport, OAuth flow
- `next.config.ts` — `.well-known` rewrites
