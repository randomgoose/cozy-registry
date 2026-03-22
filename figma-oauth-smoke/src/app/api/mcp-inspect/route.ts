import { NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/mcp";
import { requestOrigin } from "@/lib/metadata";

export const runtime = "nodejs";

/**
 * Same MCP handling as /api/mcp, but returns JSON { httpStatus, headers, body } so you can see the
 * response body without Vercel’s request table (which only shows status codes).
 *
 * Set MCP_INSPECT_SECRET in env, then send header X-MCP-Inspect: <same value>.
 * Remove secret from prod when done debugging.
 */
export async function POST(request: Request) {
  const secret = process.env.MCP_INSPECT_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "MCP_INSPECT_SECRET is not set" }, { status: 503 });
  }
  const provided = request.headers.get("x-mcp-inspect")?.trim() ?? "";
  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mcpRes = await handleMcpRequest(request, requestOrigin(request));
  const bodyText = await mcpRes.clone().text();
  let bodyJson: unknown = null;
  try {
    bodyJson = bodyText ? (JSON.parse(bodyText) as unknown) : null;
  } catch {
    bodyJson = null;
  }

  const pickHeaders = ["content-type", "mcp-session-id", "www-authenticate"];
  const headers: Record<string, string> = {};
  for (const k of pickHeaders) {
    const v = mcpRes.headers.get(k);
    if (v) headers[k] = v;
  }

  return NextResponse.json({
    httpStatus: mcpRes.status,
    headers,
    bodyRaw: bodyText.length > 50_000 ? `${bodyText.slice(0, 50_000)}…(truncated)` : bodyText,
    bodyJson,
  });
}

export async function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
