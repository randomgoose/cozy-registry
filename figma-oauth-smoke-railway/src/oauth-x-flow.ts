/**
 * Parallel OAuth implementation for A/B debugging vs ./oauth-flow.ts
 *
 * Differences:
 * - Endpoints under /api/x/oauth/*
 * - Always forwards `resource` in the consent form (if present)
 * - Never rejects requests based on resource (only logs) — isolates "strict resource match" issues
 * - Verbose [x-oauth] logs on every step
 * - Same refresh_token / iss / metadata shape as default oauth-flow (see figma-oauth-findings doc)
 */
import { signObject, verifySignedObject } from "./crypto.js";
import { getOAuthClient, validateClient } from "./oauth-config.js";
import { validatePkce } from "./pkce.js";
import { requestOrigin } from "./metadata.js";

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

type RtPayload = {
  typ: "rt";
  exp: number;
  clientId: string;
  scope: string | null;
};

const AT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const RT_TTL_MS = AT_TTL_MS;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenSuccessJson(accessToken: string, refreshToken: string, scope: string): Response {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(AT_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

async function parseTokenBody(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const j = (await request.json()) as Record<string, string>;
      return j ?? {};
    } catch {
      return {};
    }
  }
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
}

function log(phase: string, data: Record<string, unknown>): void {
  console.info(`[x-oauth] ${phase}`, { ...data, stack: "experiment /api/x" });
}

function checkClientCredentials(
  client: ReturnType<typeof getOAuthClient>,
  clientId: string,
  clientSecret: string | undefined,
  codeVerifier: string | undefined,
  grantType: "authorization_code" | "refresh_token",
): boolean {
  if (clientId !== client.clientId) return false;
  if (!client.clientSecret) return true;
  const provided = (clientSecret ?? "").trim();
  const hasVerifier = Boolean(codeVerifier?.trim());
  if (provided.length > 0 && provided !== client.clientSecret) return false;
  if (grantType === "authorization_code" && provided.length === 0 && !hasVerifier) return false;
  return true;
}

export async function xAuthorizeGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const state = url.searchParams.get("state");
  const scope = url.searchParams.get("scope");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const resource = url.searchParams.get("resource");

  log("authorize GET", {
    origin,
    clientId,
    redirectUri,
    hasState: !!state,
    hasResource: !!resource,
    resource,
    fullSearch: url.search,
  });

  if (!clientId || !redirectUri) {
    return json({ error: "invalid_request" }, 400);
  }
  if (responseType !== "code") {
    return json({ error: "unsupported_response_type" }, 400);
  }
  if (!validateClient(clientId, redirectUri)) {
    return json({ error: "invalid_client" }, 400);
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
  if (resource) q.set("resource", resource);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>x-oauth (experiment)</title></head>
<body>
  <p><strong>/api/x/oauth</strong> — experiment: resource is never validated, only logged.</p>
  <pre style="background:#f4f4f5;padding:8px;font-size:12px;">resource param: ${resource ? escapeHtml(resource) : "(none)"}</pre>
  <form method="post" action="/api/x/oauth/authorize?${q.toString()}">
    <input type="hidden" name="confirm" value="yes" />
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function xAuthorizePost(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  const scope = url.searchParams.get("scope");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const resource = url.searchParams.get("resource");

  log("authorize POST (query)", { origin, clientId, resource });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  if (form.get("confirm") !== "yes" || !clientId || !redirectUri) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!validateClient(clientId, redirectUri)) {
    return json({ error: "invalid_client" }, 400);
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
  redir.searchParams.set("iss", origin);

  log("authorize POST issued code", { clientId, hasResourceInQuery: !!resource });

  return Response.redirect(redir.toString(), 302);
}

export async function xTokenPost(request: Request): Promise<Response> {
  const origin = requestOrigin(request);
  const basicAuth = request.headers.get("authorization");
  let basicClientId: string | undefined;
  let basicSecret: string | undefined;
  if (basicAuth?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(basicAuth.slice(6), "base64").toString("utf8");
      [basicClientId, basicSecret] = decoded.split(":", 2);
    } catch {
      return json({ error: "invalid_client" }, 401);
    }
  }

  const body = await parseTokenBody(request);
  const client = getOAuthClient();
  const explicitId = (body.client_id ?? basicClientId)?.trim();
  const clientId = explicitId || client.clientId;
  const clientSecret = body.client_secret ?? basicSecret;
  const codeVerifier = body.code_verifier;
  const grantType = body.grant_type;
  const resource = body.resource;

  log("token POST", {
    origin,
    grantType,
    clientId,
    hasCode: !!body.code,
    hasVerifier: !!codeVerifier?.trim(),
    resourceFromBody: resource ?? "(absent)",
  });

  if (grantType === "refresh_token") {
    if (!checkClientCredentials(client, clientId, clientSecret, codeVerifier, "refresh_token")) {
      return json({ error: "invalid_client" }, 401);
    }
    const refreshToken = body.refresh_token?.trim();
    if (!refreshToken) {
      return json({ error: "invalid_request", error_description: "refresh_token required" }, 400);
    }
    const rt = verifySignedObject<RtPayload>(refreshToken);
    if (!rt || rt.typ !== "rt" || typeof rt.exp !== "number" || rt.exp < Date.now()) {
      return json({ error: "invalid_grant" }, 400);
    }
    if (rt.clientId !== clientId) {
      return json({ error: "invalid_grant" }, 400);
    }
    const scopeStr = rt.scope ?? "mcp:tools";
    const accessToken = signObject({
      typ: "at",
      exp: Date.now() + AT_TTL_MS,
    } satisfies AtPayload);
    const newRefresh = signObject({
      typ: "rt",
      exp: Date.now() + RT_TTL_MS,
      clientId,
      scope: rt.scope,
    } satisfies RtPayload);
    log("token POST refresh success", { clientId });
    return tokenSuccessJson(accessToken, newRefresh, scopeStr);
  }

  if (grantType !== "authorization_code") {
    return json({ error: "unsupported_grant_type" }, 400);
  }

  const code = body.code;
  const redirectUri = body.redirect_uri;

  if (!code || !redirectUri) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!checkClientCredentials(client, clientId, clientSecret, codeVerifier, "authorization_code")) {
    return json({ error: "invalid_client" }, 401);
  }

  const payload = verifySignedObject<CodePayload>(code);
  if (
    !payload ||
    payload.typ !== "code" ||
    typeof payload.exp !== "number" ||
    payload.exp < Date.now()
  ) {
    return json({ error: "invalid_grant" }, 400);
  }
  if (payload.clientId !== clientId || payload.redirectUri !== redirectUri) {
    return json({ error: "invalid_grant" }, 400);
  }
  if (
    !validatePkce({
      codeChallenge: payload.codeChallenge,
      codeChallengeMethod: payload.codeChallengeMethod,
      codeVerifier,
    })
  ) {
    return json({ error: "invalid_grant" }, 400);
  }

  const scopeStr = payload.scope ?? "mcp:tools";
  const accessToken = signObject({
    typ: "at",
    exp: Date.now() + AT_TTL_MS,
  } satisfies AtPayload);
  const refreshToken = signObject({
    typ: "rt",
    exp: Date.now() + RT_TTL_MS,
    clientId,
    scope: payload.scope,
  } satisfies RtPayload);

  log("token POST code success", { clientId, tokenLen: accessToken.length });

  return tokenSuccessJson(accessToken, refreshToken, scopeStr);
}
