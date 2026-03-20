import { NextResponse } from "next/server";
import { getAuthorizationServerMetadata } from "@/lib/oauth-metadata";

export async function GET() {
  return NextResponse.json(getAuthorizationServerMetadata(), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
