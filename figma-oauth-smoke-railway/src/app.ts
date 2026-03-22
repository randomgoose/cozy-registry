import { Hono } from "hono";
import { cors } from "hono/cors";
import { authorizeGet, authorizePost, tokenPost } from "./oauth-flow.js";
import { handleMcpRequest, mcpOptionsResponse } from "./mcp.js";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
  requestOrigin,
} from "./metadata.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "Mcp-Protocol-Version",
      "X-MCP-Inspect",
    ],
    maxAge: 86400,
  }),
);

app.get("/", (c) =>
  c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>figma-oauth-smoke-railway</title></head>
<body>
  <h1>figma-oauth-smoke-railway</h1>
  <p>Hono on Node — for <a href="https://railway.app">Railway</a> (long-lived process).</p>
  <ul>
    <li>MCP (Figma): <code>/api/mcp</code></li>
    <li><a href="/api/health">/api/health</a></li>
    <li><a href="/.well-known/oauth-authorization-server">/.well-known/oauth-authorization-server</a></li>
    <li><a href="/.well-known/oauth-protected-resource">/.well-known/oauth-protected-resource</a></li>
  </ul>
</body>
</html>`),
);

app.get("/api/health", (c) => c.json({ ok: true, service: "figma-oauth-smoke-railway" }));

app.get("/.well-known/oauth-authorization-server", (c) => {
  const origin = requestOrigin(c.req.raw);
  return c.json(authorizationServerMetadata(origin), 200, {
    "Cache-Control": "no-store",
  });
});

app.get("/.well-known/oauth-protected-resource", (c) => {
  const origin = requestOrigin(c.req.raw);
  return c.json(protectedResourceMetadata(origin), 200, {
    "Cache-Control": "no-store",
  });
});

app.get("/api/oauth/authorize", (c) => authorizeGet(c.req.raw));
app.post("/api/oauth/authorize", (c) => authorizePost(c.req.raw));
app.post("/api/oauth/token", (c) => tokenPost(c.req.raw));

app.get("/api/mcp", (c) => handleMcpRequest(c.req.raw, requestOrigin(c.req.raw)));
app.post("/api/mcp", (c) => handleMcpRequest(c.req.raw, requestOrigin(c.req.raw)));
app.delete("/api/mcp", (c) => handleMcpRequest(c.req.raw, requestOrigin(c.req.raw)));
app.options("/api/mcp", () => mcpOptionsResponse());

app.post("/api/mcp-inspect", async (c) => {
  const secret = process.env.MCP_INSPECT_SECRET?.trim();
  if (!secret) {
    return c.json({ error: "MCP_INSPECT_SECRET is not set" }, 503);
  }
  const provided = c.req.header("x-mcp-inspect")?.trim() ?? "";
  if (!provided || provided !== secret) {
    return c.json({ error: "Not found" }, 404);
  }

  const mcpRes = await handleMcpRequest(c.req.raw, requestOrigin(c.req.raw));
  const bodyText = await mcpRes.clone().text();
  let bodyJson: unknown = null;
  try {
    bodyJson = bodyText ? (JSON.parse(bodyText) as unknown) : null;
  } catch {
    bodyJson = null;
  }

  const pickHeaders = ["content-type", "mcp-session-id", "www-authenticate"];
  const headers: Record<string, string> = {};
  for (const k of pickHeaders) {
    const v = mcpRes.headers.get(k);
    if (v) headers[k] = v;
  }

  return c.json({
    httpStatus: mcpRes.status,
    headers,
    bodyRaw: bodyText.length > 50_000 ? `${bodyText.slice(0, 50_000)}…(truncated)` : bodyText,
    bodyJson,
  });
});

export { app };
