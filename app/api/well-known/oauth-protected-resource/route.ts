import { NextResponse } from "next/server";
import { getCanonicalBaseUrlFromRequest } from "@/lib/oauth";
import { getProtectedResourceMetadata } from "@/lib/oauth-metadata";

/**
 * Protected Resource Metadata (RFC 9728) for MCP OAuth discovery.
 * Figma Make and other MCP clients fetch this to find the authorization server.
 */
export async function GET(request: Request) {
  const baseUrl = getCanonicalBaseUrlFromRequest(request);
  return NextResponse.json(getProtectedResourceMetadata(baseUrl), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
