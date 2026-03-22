import { NextResponse } from "next/server";
import {
  getOAuthClient,
  consumeAuthorizationCode,
  createApiKeyForOAuth,
  validateOAuthResourceParam,
  mintOAuthRefreshToken,
  parseOAuthRefreshToken,
  OAUTH_ACCESS_EXPIRES_IN_SEC,
} from "@/lib/oauth";

const DEFAULT_SCOPE = "mcp:tools";

function validateClientForTokenEndpoint(
  client: ReturnType<typeof getOAuthClient>,
  clientId: string,
  clientSecret: string | undefined,
  codeVerifier: string | undefined,
  grantType: "authorization_code" | "refresh_token"
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
  grantType: "authorization_code" | "refresh_token"
): NextResponse | null {
  if (validateClientForTokenEndpoint(client, clientId, clientSecret, codeVerifier, grantType)) {
    return null;
  }
  if (clientId !== client.clientId) {
    console.error("[OAuth] token invalid client id", { clientId, grantType });
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }
  if (client.clientSecret) {
    const provided = (clientSecret ?? "").trim();
    const hasVerifier = Boolean(codeVerifier?.trim());
    if (provided.length > 0 && provided !== client.clientSecret) {
      console.error("[OAuth] token invalid client secret", { clientId, grantType });
      return NextResponse.json({ error: "invalid_client" }, { status: 401 });
    }
    if (grantType === "authorization_code" && provided.length === 0 && !hasVerifier) {
      console.error("[OAuth] token missing client_secret and no PKCE code_verifier", {
        clientId,
        grantType,
      });
      return NextResponse.json(
        {
          error: "invalid_client",
          error_description: "client_secret or code_verifier required",
        },
        { status: 401 }
      );
    }
  }
  return NextResponse.json({ error: "invalid_client" }, { status: 401 });
}

function tokenSuccessResponse(accessToken: string, refreshToken: string, scope: string) {
  return NextResponse.json(
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
    }
  );
}

export async function POST(request: Request) {
  const basicAuth = request.headers.get("authorization");
  let body: Record<string, string>;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = (await request.json()) as Record<string, string>;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    body = Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
  } else {
    console.error("[OAuth] token invalid content type", {
      contentType,
    });
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Content-Type must be application/json or application/x-www-form-urlencoded",
      },
      { status: 400 }
    );
  }

  let basicClientId: string | undefined;
  let basicClientSecret: string | undefined;

  if (basicAuth?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(basicAuth.slice(6), "base64").toString("utf8");
      [basicClientId, basicClientSecret] = decoded.split(":", 2);
    } catch {
      console.error("[OAuth] token invalid basic auth");
      return NextResponse.json({ error: "invalid_client" }, { status: 401 });
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
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "resource does not match this server's MCP URL",
      },
      { status: 400 }
    );
  }

  if (grantType === "refresh_token") {
    const rejected = rejectInvalidTokenClient(client, clientId, clientSecret, codeVerifier, "refresh_token");
    if (rejected) return rejected;

    const refreshTokenRaw = body.refresh_token?.trim();
    if (!refreshTokenRaw) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "refresh_token required" },
        { status: 400 }
      );
    }

    const rt = parseOAuthRefreshToken(refreshTokenRaw);
    if (!rt || rt.clientId !== clientId) {
      console.error("[OAuth] token refresh invalid grant", { clientId });
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Invalid or expired refresh token" },
        { status: 400 }
      );
    }

    const scopeStr = rt.scope?.trim() || DEFAULT_SCOPE;
    const accessToken = await createApiKeyForOAuth(rt.userId);
    const newRefresh = mintOAuthRefreshToken({
      userId: rt.userId,
      clientId,
      scope: rt.scope,
    });

    console.info("[OAuth] token issued via refresh", { clientId, userId: rt.userId });

    return tokenSuccessResponse(accessToken, newRefresh, scopeStr);
  }

  if (grantType !== "authorization_code") {
    console.error("[OAuth] token unsupported grant", { grantType });
    return NextResponse.json(
      {
        error: "unsupported_grant_type",
        error_description: "grant_type must be authorization_code or refresh_token",
      },
      { status: 400 }
    );
  }

  const code = body.code;
  const redirectUri = body.redirect_uri;

  if (!code || !redirectUri) {
    console.error("[OAuth] token missing required fields", {
      hasCode: !!code,
      hasRedirectUri: !!redirectUri,
      hasCodeVerifier: !!codeVerifier,
    });
    return NextResponse.json(
      { error: "invalid_request", error_description: "code and redirect_uri required" },
      { status: 400 }
    );
  }

  const rejected = rejectInvalidTokenClient(client, clientId, clientSecret, codeVerifier, "authorization_code");
  if (rejected) return rejected;

  const consumed = await consumeAuthorizationCode(code, clientId, redirectUri, codeVerifier);
  if (!consumed) {
    console.error("[OAuth] token invalid grant", {
      clientId,
      redirectUri,
      hasCodeVerifier: !!codeVerifier,
    });
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid or expired authorization code" },
      { status: 400 }
    );
  }

  const scopeStr = consumed.scope?.trim() || DEFAULT_SCOPE;
  const accessToken = await createApiKeyForOAuth(consumed.userId);
  const refreshToken = mintOAuthRefreshToken({
    userId: consumed.userId,
    clientId,
    scope: consumed.scope,
  });

  console.info("[OAuth] token issued access + refresh", {
    clientId,
    redirectUri,
    userId: consumed.userId,
    hasCodeVerifier: !!codeVerifier,
  });

  return tokenSuccessResponse(accessToken, refreshToken, scopeStr);
}
