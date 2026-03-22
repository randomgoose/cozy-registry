import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/oauth";

const FIGMA_CALLBACK = "https://www.figma.com/oauth/mcp/callback";

/**
 * Dynamic client registration probe (RFC 7591-style response). Cozy uses a fixed Figma Advanced client;
 * we echo that id so settings stay aligned.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* empty body ok */
  }

  const c = getOAuthClient();
  const issued = Math.floor(Date.now() / 1000);
  const secretFromBody = typeof body.client_secret === "string" ? body.client_secret : undefined;
  const clientSecret =
    secretFromBody ?? (c.clientSecret ? c.clientSecret : "figma-make-placeholder-secret");

  const redirectUris = Array.isArray(body.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === "string")
    : [FIGMA_CALLBACK];

  return NextResponse.json(
    {
      client_id: c.clientId,
      client_id_issued_at: issued,
      client_secret: clientSecret,
      client_secret_expires_at: 0,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      redirect_uris: redirectUris.length > 0 ? redirectUris : [FIGMA_CALLBACK],
      token_endpoint_auth_method: "client_secret_post",
      scope: typeof body.scope === "string" ? body.scope : "mcp:tools",
    },
    { status: 201 }
  );
}
