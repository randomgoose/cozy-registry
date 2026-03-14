import { NextResponse } from "next/server";
import { getOAuthClient, consumeAuthorizationCode, createApiKeyForOAuth } from "@/lib/oauth";

export async function POST(request: Request) {
  let body: Record<string, string>;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = (await request.json()) as Record<string, string>;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    body = Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
  } else {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Content-Type must be application/json or application/x-www-form-urlencoded" },
      { status: 400 }
    );
  }

  const grantType = body.grant_type;
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const clientId = body.client_id;
  const clientSecret = body.client_secret;

  if (grantType !== "authorization_code") {
    return NextResponse.json(
      { error: "unsupported_grant_type", error_description: "grant_type=authorization_code only" },
      { status: 400 }
    );
  }
  if (!code || !redirectUri || !clientId) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "code, redirect_uri, client_id required" },
      { status: 400 }
    );
  }

  const client = getOAuthClient();
  if (clientId !== client.clientId) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }
  if (client.clientSecret && clientSecret !== client.clientSecret) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  const userId = await consumeAuthorizationCode(code, clientId, redirectUri);
  if (!userId) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid or expired authorization code" },
      { status: 400 }
    );
  }

  const accessToken = await createApiKeyForOAuth(userId);

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: null,
    scope: "mcp:tools",
  });
}
