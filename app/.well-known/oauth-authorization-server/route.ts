import { NextResponse } from "next/server";
import { getCanonicalBaseUrlFromRequest } from "@/lib/oauth";
import { getAuthorizationServerMetadata } from "@/lib/oauth-metadata";

export async function GET(request: Request) {
  const baseUrl = getCanonicalBaseUrlFromRequest(request);
  return NextResponse.json(getAuthorizationServerMetadata(baseUrl), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
