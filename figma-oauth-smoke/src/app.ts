import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { signObject, verifySignedObject } from "./crypto.js";
import { getOAuthClient, validateClient } from "./oauth-config.js";
import { validatePkce } from "./pkce.js";
import { requestOrigin } from "./metadata.js";
import { handleMcpRequest, mcpOptionsResponse } from "./mcp.js";

type CodePayload = {
  typ: "code";
  exp: number;
  clientId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  scope: string | null;
  state: string | null;
};

type AtPayload = {
  typ: "at";
  exp: number;
};

const AT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

async function parseTokenBody(c: Context): Promise<Record<string, string>> {
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await c.req.json()) as Record<string, string>;
    return j ?? {};
  }
  const text = await c.req.text();
  return Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
}

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version"],
    maxAge: 86400,
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, service: "figma-oauth-smoke" }));

app.get("/api/oauth/authorize", (c) => {
  const clientId = c.req.query("client_id");
  const redirectUri = c.req.query("redirect_uri");
  const responseType = c.req.query("response_type");
  const state = c.req.query("state");
  const scope = c.req.query("scope");
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method");

  if (!clientId || !redirectUri) {
    return c.json({ error: "invalid_request" }, 400);
  }
  if (responseType !== "code") {
    return c.json({ error: "unsupported_response_type" }, 400);
  }
  if (!validateClient(clientId, redirectUri)) {
    return c.json({ error: "invalid_client" }, 400);
  }

  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
  });
  if (state) q.set("state", state);
  if (scope) q.set("scope", scope);
  if (codeChallenge) q.set("code_challenge", codeChallenge);
  if (codeChallengeMethod) q.set("code_challenge_method", codeChallengeMethod);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Authorize (smoke)</title></head>
<body>
  <p><strong>figma-oauth-smoke</strong> — no real login; click to issue code.</p>
  <form method="post" action="/api/oauth/authorize?${q.toString()}">
    <input type="hidden" name="confirm" value="yes" />
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
  return c.html(html);
});

app.post("/api/oauth/authorize", async (c) => {
  const clientId = c.req.query("client_id");
  const redirectUri = c.req.query("redirect_uri");
  const state = c.req.query("state");
  const scope = c.req.query("scope");
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method");

  const body = await c.req.parseBody();
  if (body.confirm !== "yes" || !clientId || !redirectUri) {
    return c.json({ error: "invalid_request" }, 400);
  }
  if (!validateClient(clientId, redirectUri)) {
    return c.json({ error: "invalid_client" }, 400);
  }

  const payload: CodePayload = {
    typ: "code",
    exp: Date.now() + 10 * 60 * 1000,
    clientId,
    redirectUri,
    codeChallenge: codeChallenge ?? null,
    codeChallengeMethod: codeChallengeMethod ?? null,
    scope: scope ?? null,
    state: state ?? null,
  };
  const code = signObject(payload);
  const redir = new URL(redirectUri);
  redir.searchParams.set("code", code);
  if (state) redir.searchParams.set("state", state);
  return c.redirect(redir.toString(), 302);
});

app.post("/api/oauth/token", async (c) => {
  const basicAuth = c.req.header("authorization");
  let basicClientId: string | undefined;
  let basicSecret: string | undefined;
  if (basicAuth?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(basicAuth.slice(6), "base64").toString("utf8");
      [basicClientId, basicSecret] = decoded.split(":", 2);
    } catch {
      return c.json({ error: "invalid_client" }, 401);
    }
  }

  const body = await parseTokenBody(c);
  const client = getOAuthClient();
  const explicitId = (body.client_id ?? basicClientId)?.trim();
  const clientId = explicitId || client.clientId;
  const clientSecret = body.client_secret ?? basicSecret;
  const codeVerifier = body.code_verifier;
  const grantType = body.grant_type;
  const code = body.code;
  const redirectUri = body.redirect_uri;

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }
  if (!code || !redirectUri) {
    return c.json({ error: "invalid_request" }, 400);
  }
  if (clientId !== client.clientId) {
    return c.json({ error: "invalid_client" }, 401);
  }

  if (client.clientSecret) {
    const provided = (clientSecret ?? "").trim();
    const hasVerifier = Boolean(codeVerifier?.trim());
    if (provided.length > 0 && provided !== client.clientSecret) {
      return c.json({ error: "invalid_client" }, 401);
    }
    if (provided.length === 0 && !hasVerifier) {
      return c.json({ error: "invalid_client" }, 401);
    }
  }

  const payload = verifySignedObject<CodePayload>(code);
  if (
    !payload ||
    payload.typ !== "code" ||
    typeof payload.exp !== "number" ||
    payload.exp < Date.now()
  ) {
    return c.json({ error: "invalid_grant" }, 400);
  }
  if (payload.clientId !== clientId || payload.redirectUri !== redirectUri) {
    return c.json({ error: "invalid_grant" }, 400);
  }
  if (
    !validatePkce({
      codeChallenge: payload.codeChallenge,
      codeChallengeMethod: payload.codeChallengeMethod,
      codeVerifier,
    })
  ) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  const atPayload: AtPayload = {
    typ: "at",
    exp: Date.now() + AT_TTL_MS,
  };
  const accessToken = signObject(atPayload);

  return c.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(AT_TTL_MS / 1000),
      scope: "mcp:tools",
    },
    200,
    {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  );
});

app.on(["GET", "POST", "DELETE"], "/api/mcp", async (c) => {
  const res = await handleMcpRequest(c.req.raw, requestOrigin(c.req.raw));
  return res;
});

app.options("/api/mcp", () => mcpOptionsResponse());
