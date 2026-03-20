import { NextResponse } from "next/server";
import { getCanonicalBaseUrlFromRequest } from "@/lib/oauth";
import { getAuthorizationServerMetadata } from "@/lib/oauth-metadata";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Clients use this to find authorization_endpoint and token_endpoint.
 */
export async function GET(request: Request) {
  const baseUrl = getCanonicalBaseUrlFromRequest(request);
  return NextResponse.json(getAuthorizationServerMetadata(baseUrl), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
