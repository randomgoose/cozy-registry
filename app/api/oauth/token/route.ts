import { NextResponse } from "next/server";
import { getOAuthClient, consumeAuthorizationCode, createApiKeyForOAuth } from "@/lib/oauth";

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
      { error: "invalid_request", error_description: "Content-Type must be application/json or application/x-www-form-urlencoded" },
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
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const client = getOAuthClient();
  // Figma Make often sends PKCE (code_verifier) without client_id in the body; Basic auth may omit
  // the id as well. We only register one MCP OAuth client, so default when absent or blank.
  const explicitClientId = (body.client_id ?? basicClientId)?.trim();
  const clientId = explicitClientId || client.clientId;
  const clientSecret = body.client_secret ?? basicClientSecret;
  const codeVerifier = body.code_verifier;

  if (grantType !== "authorization_code") {
    console.error("[OAuth] token unsupported grant", { grantType });
    return NextResponse.json(
      { error: "unsupported_grant_type", error_description: "grant_type=authorization_code only" },
      { status: 400 }
    );
  }
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

  if (clientId !== client.clientId) {
    console.error("[OAuth] token invalid client id", { clientId });
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  // When OAUTH_FIGMA_CLIENT_SECRET is set we still must accept Figma Make's PKCE-only token POSTs
  // (no client_secret in body or Basic). PKCE proves control of the authorize flow; optional secret
  // in Figma Advanced settings can still be sent and must match when present.
  if (client.clientSecret) {
    const provided = (clientSecret ?? "").trim();
    const hasVerifier = Boolean(codeVerifier?.trim());
    if (provided.length > 0 && provided !== client.clientSecret) {
      console.error("[OAuth] token invalid client secret", { clientId });
      return NextResponse.json({ error: "invalid_client" }, { status: 401 });
    }
    if (provided.length === 0 && !hasVerifier) {
      console.error("[OAuth] token missing client_secret and no PKCE code_verifier", {
        clientId,
      });
      return NextResponse.json(
        {
          error: "invalid_client",
          error_description: "client_secret or code_verifier required",
        },
        { status: 401 },
      );
    }
  }

  const userId = await consumeAuthorizationCode(code, clientId, redirectUri, codeVerifier);
  if (!userId) {
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

  const accessToken = await createApiKeyForOAuth(userId);

  console.info("[OAuth] token issued access token", {
    clientId,
    redirectUri,
    userId,
    hasCodeVerifier: !!codeVerifier,
  });

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 31536000,
      scope: "mcp:tools",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}
