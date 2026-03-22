# figma-oauth-smoke-railway

Same **Figma Make MCP + OAuth smoke** as `figma-oauth-smoke` (Next on Vercel), but implemented with **Hono + `@hono/node-server`** as a **long-lived Node process** — a better fit for **Railway** (and similar PaaS) when you want to rule out serverless/Vercel behavior.

## Endpoints

- **MCP:** `https://<host>/api/mcp`
- **OAuth:** `/api/oauth/authorize`, `/api/oauth/token`
- **Discovery:** `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`
- **Debug body:** `POST /api/mcp-inspect` + header `X-MCP-Inspect` (requires env `MCP_INSPECT_SECRET`)

## Local

```bash
cd figma-oauth-smoke-railway
npm install
cp .env.example .env   # set OAUTH_CODE_SIGNING_SECRET
npm run dev
```

## Railway

1. **New project → Deploy from GitHub** (or CLI), set the service **root directory** to `figma-oauth-smoke-railway` if the repo is the monorepo root.
2. **Variables** (minimum):
   - `OAUTH_CODE_SIGNING_SECRET` — long random string (required for real use).
   - Optional: `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` (or `OAUTH_FIGMA_*`) to match Figma Advanced settings.
3. Railway sets **`PORT`**; the server binds **`0.0.0.0`** by default.
4. **Build command:** `npm run build`  
   **Start command:** `npm start`

Or use the included **Dockerfile** (set builder to Docker in Railway if you prefer).

## Figma

Use the **public HTTPS URL** Railway assigns, e.g. `https://xxxx.up.railway.app/api/mcp`.  
Update the connector if the hostname changes (PRM `resource` must match that MCP URL).
