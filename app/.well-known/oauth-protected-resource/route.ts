import { NextResponse } from "next/server";
import { getProtectedResourceMetadata } from "@/lib/oauth-metadata";

export async function GET() {
  return NextResponse.json(getProtectedResourceMetadata(), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
