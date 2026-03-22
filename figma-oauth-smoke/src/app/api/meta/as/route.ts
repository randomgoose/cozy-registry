import { NextResponse } from "next/server";
import { authorizationServerMetadata, requestOrigin } from "@/lib/metadata";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...cors } });
}

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const body = authorizationServerMetadata(origin);
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}
