import { NextResponse } from "next/server";
import { getBaseUrl, getMcpResourceUrl } from "@/lib/oauth";

/**
 * Protected Resource Metadata (RFC 9728) for MCP OAuth discovery.
 * Figma Make and other MCP clients fetch this to find the authorization server.
 */
export async function GET() {
  const baseUrl = getBaseUrl();
  const metadata = {
    resource: getMcpResourceUrl(),
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:tools"],
  };
  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
