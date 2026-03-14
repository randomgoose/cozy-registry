import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/oauth";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Clients use this to find authorization_endpoint and token_endpoint.
 */
export async function GET() {
  const baseUrl = getBaseUrl();
  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    scopes_supported: ["mcp:tools"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
  };
  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
