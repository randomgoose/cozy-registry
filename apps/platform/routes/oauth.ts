import {
  OAUTH_ACCESS_EXPIRES_IN_SEC,
  consumeAuthorizationCode,
  createAuthorizationCode,
  createApiKeyForOAuth,
  getCanonicalBaseUrlFromRequest,
  getOAuthClient,
  mintOAuthRefreshToken,
  parseOAuthRefreshToken,
  selectOAuthClientForRegistration,
  validateClient,
  validateOAuthResourceParam,
} from "@cozy/oauth/oauth";
import { getAppUrl } from "@cozy/auth-runtime/app-url";
import { auth } from "@cozy/auth-runtime/auth";

const DEFAULT_SCOPE = "mcp:tools";
const FIGMA_CALLBACK = "https://www.figma.com/oauth/mcp/callback";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(
  body: unknown,
  init?: ResponseInit,
) {
  return Response.json(body, init);
}

function redirect(location: string, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
    },
  });
}

function tokenSuccessResponse(accessToken: string, refreshToken: string, scope: string) {
  return json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: OAUTH_ACCESS_EXPIRES_IN_SEC,
      refresh_token: refreshToken,
      scope,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

function validateClientForTokenEndpoint(
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

function rejectInvalidTokenClient(
  client: ReturnType<typeof getOAuthClient>,
  clientId: string,
  clientSecret: string | undefined,
  codeVerifier: string | undefined,
  grantType: "authorization_code" | "refresh_token",
): Response | null {
  if (validateClientForTokenEndpoint(client, clientId, clientSecret, codeVerifier, grantType)) {
    return null;
  }
  if (clientId !== client.clientId) {
    console.error("[OAuth] token invalid client id", { clientId, grantType });
    return json({ error: "invalid_client" }, { status: 401 });
  }
  if (client.clientSecret) {
    const provided = (clientSecret ?? "").trim();
    const hasVerifier = Boolean(codeVerifier?.trim());
    if (provided.length > 0 && provided !== client.clientSecret) {
      console.error("[OAuth] token invalid client secret", { clientId, grantType });
      return json({ error: "invalid_client" }, { status: 401 });
    }
    if (grantType === "authorization_code" && provided.length === 0 && !hasVerifier) {
      console.error("[OAuth] token missing client_secret and no PKCE code_verifier", {
        clientId,
        grantType,
      });
      return json(
        {
          error: "invalid_client",
          error_description: "client_secret or code_verifier required",
        },
        { status: 401 },
      );
    }
  }
  return json({ error: "invalid_client" }, { status: 401 });
}

export async function handlePlatformOAuthAuthorizeRoute(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const state = searchParams.get("state");
  const scope = searchParams.get("scope");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const resource = searchParams.get("resource");

  if (request.method === "GET") {
    if (!clientId || !redirectUri) {
      return json(
        { error: "invalid_request", error_description: "client_id and redirect_uri required" },
        { status: 400 },
      );
    }
    if (responseType !== "code") {
      return json(
        { error: "unsupported_response_type", error_description: "response_type=code only" },
        { status: 400 },
      );
    }

    const validation = validateClient(clientId, redirectUri);
    if (!validation.valid) {
      console.error("[OAuth] authorize GET invalid client", {
        clientId,
        redirectUri,
        error: validation.error,
      });
      return json(
        { error: validation.error, error_description: "Invalid client or redirect_uri" },
        { status: 400 },
      );
    }

    if (!validateOAuthResourceParam(request, resource).ok) {
      return json(
        {
          error: "invalid_request",
          error_description: "resource does not match this server's MCP URL",
        },
        { status: 400 },
      );
    }

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      const signInUrl = `${getAppUrl()}/sign-in?callbackUrl=${encodeURIComponent(request.url)}`;
      return redirect(signInUrl);
    }

    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri });
    if (state) params.set("state", state);
    if (scope) params.set("scope", scope);
    if (codeChallenge) params.set("code_challenge", codeChallenge);
    if (codeChallengeMethod) params.set("code_challenge_method", codeChallengeMethod);
    if (resource) params.set("resource", resource);
    const postUrl = `/api/oauth/authorize?${params.toString()}`;
    const cancelUrl = `${getAppUrl()}/`;
    const appDisplayName = escapeHtml(getOAuthClient(clientId).displayName);

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Authorize ${appDisplayName} · Cozy Registry</title></head>
<body style="font-family: system-ui; max-width: 420px; margin: 2rem auto; padding: 0 1rem;">
  <h1 style="font-size: 1.25rem;">Authorize ${appDisplayName} to access Cozy Registry</h1>
  <p>${appDisplayName} is requesting access to your Cozy Registry account, including registry browsing and publishing permissions.</p>
  <form method="post" action="${postUrl}" style="display: flex; gap: 0.75rem;">
    <input type="hidden" name="confirm" value="yes" />
    <button type="submit" style="padding: 0.5rem 1rem; background: #18181b; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Allow access</button>
    <a href="${cancelUrl}" style="padding: 0.5rem 1rem; color: #71717a;">Cancel</a>
  </form>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let bodyConfirm: string | null = null;
  try {
    const form = await request.formData();
    bodyConfirm = form.get("confirm") as string | null;
  } catch {
    // ignore
  }

  if (!clientId || !redirectUri || bodyConfirm !== "yes") {
    return json(
      { error: "invalid_request", error_description: "Missing or invalid confirm" },
      { status: 400 },
    );
  }

  const validation = validateClient(clientId, redirectUri);
  if (!validation.valid) {
    console.error("[OAuth] authorize POST invalid client", {
      clientId,
      redirectUri,
      error: validation.error,
    });
    return json(
      { error: validation.error, error_description: "Invalid client or redirect_uri" },
      { status: 400 },
    );
  }

  if (!validateOAuthResourceParam(request, resource).ok) {
    return json(
      {
        error: "invalid_request",
        error_description: "resource does not match this server's MCP URL",
      },
      { status: 400 },
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return json(
      { error: "access_denied", error_description: "Not signed in" },
      { status: 403 },
    );
  }

  const code = await createAuthorizationCode({
    userId: session.user.id,
    clientId,
    redirectUri,
    scope: scope ?? null,
    state: state ?? null,
    codeChallenge: codeChallenge ?? null,
    codeChallengeMethod: codeChallengeMethod ?? null,
  });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  const issuer = getCanonicalBaseUrlFromRequest(request).replace(/\/$/, "");
  target.searchParams.set("iss", issuer);

  return redirect(target.toString(), 302);
}

export async function handlePlatformOAuthTokenRoute(request: Request): Promise<Response> {
  const basicAuth = request.headers.get("authorization");
  let body: Record<string, string>;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = (await request.json()) as Record<string, string>;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    body = Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
  } else {
    return json(
      {
        error: "invalid_request",
        error_description:
          "Content-Type must be application/json or application/x-www-form-urlencoded",
      },
      { status: 400 },
    );
  }

  let basicClientId: string | undefined;
  let basicClientSecret: string | undefined;

  if (basicAuth?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(basicAuth.slice(6), "base64").toString("utf8");
      [basicClientId, basicClientSecret] = decoded.split(":", 2);
    } catch {
      return json({ error: "invalid_client" }, { status: 401 });
    }
  }

  const grantType = body.grant_type;
  const explicitClientId = (body.client_id ?? basicClientId)?.trim();
  const client = getOAuthClient(explicitClientId || basicClientId || undefined);
  const clientId = explicitClientId || client.clientId;
  const clientSecret = body.client_secret ?? basicClientSecret;
  const codeVerifier = body.code_verifier;
  const resource = body.resource;

  if (!validateOAuthResourceParam(request, resource).ok) {
    return json(
      {
        error: "invalid_request",
        error_description: "resource does not match this server's MCP URL",
      },
      { status: 400 },
    );
  }

  if (grantType === "refresh_token") {
    const rejected = rejectInvalidTokenClient(
      client,
      clientId,
      clientSecret,
      codeVerifier,
      "refresh_token",
    );
    if (rejected) return rejected;

    const refreshTokenRaw = body.refresh_token?.trim();
    if (!refreshTokenRaw) {
      return json(
        { error: "invalid_request", error_description: "refresh_token required" },
        { status: 400 },
      );
    }

    const rt = parseOAuthRefreshToken(refreshTokenRaw);
    if (!rt || rt.clientId !== clientId) {
      return json(
        { error: "invalid_grant", error_description: "Invalid or expired refresh token" },
        { status: 400 },
      );
    }

    const scopeStr = rt.scope?.trim() || DEFAULT_SCOPE;
    const accessToken = await createApiKeyForOAuth(rt.userId);
    const newRefresh = mintOAuthRefreshToken({
      userId: rt.userId,
      clientId,
      scope: rt.scope,
    });

    return tokenSuccessResponse(accessToken, newRefresh, scopeStr);
  }

  if (grantType !== "authorization_code") {
    return json(
      {
        error: "unsupported_grant_type",
        error_description: "grant_type must be authorization_code or refresh_token",
      },
      { status: 400 },
    );
  }

  const code = body.code;
  const redirectUri = body.redirect_uri;
  if (!code || !redirectUri) {
    return json(
      { error: "invalid_request", error_description: "code and redirect_uri required" },
      { status: 400 },
    );
  }

  const rejected = rejectInvalidTokenClient(
    client,
    clientId,
    clientSecret,
    codeVerifier,
    "authorization_code",
  );
  if (rejected) return rejected;

  const consumed = await consumeAuthorizationCode(code, clientId, redirectUri, codeVerifier);
  if (!consumed) {
    return json(
      { error: "invalid_grant", error_description: "Invalid or expired authorization code" },
      { status: 400 },
    );
  }

  const scopeStr = consumed.scope?.trim() || DEFAULT_SCOPE;
  const accessToken = await createApiKeyForOAuth(consumed.userId);
  const refreshToken = mintOAuthRefreshToken({
    userId: consumed.userId,
    clientId,
    scope: consumed.scope,
  });

  return tokenSuccessResponse(accessToken, refreshToken, scopeStr);
}

export async function handlePlatformOAuthRegisterRoute(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // empty body ok
  }

  const client = selectOAuthClientForRegistration(body);
  const issued = Math.floor(Date.now() / 1000);
  const secretFromBody = typeof body.client_secret === "string" ? body.client_secret : undefined;
  const clientSecret =
    client.tokenEndpointAuthMethod === "none"
      ? undefined
      : secretFromBody ??
        (client.clientSecret ? client.clientSecret : `${client.tool}-placeholder-secret`);

  const redirectUris = Array.isArray(body.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === "string")
    : client.redirectUris.length > 0
      ? client.redirectUris
      : [FIGMA_CALLBACK];

  return json(
    {
      client_id: client.clientId,
      client_id_issued_at: issued,
      ...(clientSecret
        ? {
            client_secret: clientSecret,
            client_secret_expires_at: 0,
          }
        : {}),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      redirect_uris: redirectUris.length > 0 ? redirectUris : [FIGMA_CALLBACK],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      scope: typeof body.scope === "string" ? body.scope : "mcp:tools",
    },
    { status: 201 },
  );
}
