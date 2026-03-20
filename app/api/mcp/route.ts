import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRegistryMcpServer } from "@/lib/mcp-tools";
import { getCanonicalBaseUrlFromRequest } from "@/lib/oauth";

// Stateless mode: create fresh server + transport per request (required for serverless).
// Reusing stateless transport causes message ID collisions.
//
// Default SSE mode opens a long-lived stream; clients often follow POST with a GET for a
// second SSE channel. Each serverless invocation uses a *new* transport, so that GET
// sees an uninitialized stream and never receives events — Figma Connectors can spin forever.
// JSON responses complete each RPC in one response body, which fits serverless.
function standaloneSseNoopResponse(): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Close immediately so clients don’t wait on an empty stream (new transport per invoke).
      controller.enqueue(enc.encode(": noop\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const hasToken = !!(authHeader?.startsWith("Bearer ") && authHeader.slice(7).trim());
  if (!hasToken) {
    const baseUrl = getCanonicalBaseUrlFromRequest(request);
    const prmUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Authorization required. Use OAuth or Bearer token.",
        },
        id: null,
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer realm="cozy-registry", resource_metadata="${prmUrl}"`,
        },
      }
    );
  }

  // Second-channel GET SSE would use a fresh transport with no shared state; the SDK would
  // return an open stream that never receives events. Short-circuit after auth.
  const accept = request.headers.get("accept") ?? "";
  if (request.method === "GET" && accept.includes("text/event-stream")) {
    return standaloneSseNoopResponse();
  }

  try {
    const server = createRegistryMcpServer(request);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless for serverless
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[MCP] handleRequest error", {
      method: request.method,
      url: request.url,
      hasAuthorization: !!request.headers.get("authorization"),
      userAgent: request.headers.get("user-agent"),
      message,
      stack,
    });
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: `Internal error: ${message}` },
        id: null,
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(res.body, { status: res.status, headers });
}

export async function GET(request: Request) {
  return withCors(await handleMcpRequest(request));
}

export async function POST(request: Request) {
  return withCors(await handleMcpRequest(request));
}

export async function DELETE(request: Request) {
  return withCors(await handleMcpRequest(request));
}
