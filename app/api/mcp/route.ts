import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRegistryMcpServer } from "@/lib/mcp-tools";

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

// Stateless mode: create fresh server + transport per request (required for serverless).
// Reusing stateless transport causes message ID collisions.
//
// In serverless we cannot reliably maintain the two-channel SSE flow across invocations.
// Force JSON responses for write/read RPC calls so each request completes in one response body.
function noContentSseResponse(): Response {
  return new Response("event: close\ndata: {}\n\n", {
    status: 200,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
    },
  });
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const hasToken = !!extractBearerToken(authHeader);
  if (!hasToken) {
    const baseUrl = new URL(request.url).origin;
    const prmUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
    console.warn("[MCP] missing bearer token", {
      method: request.method,
      url: request.url,
      userAgent: request.headers.get("user-agent"),
      accept: request.headers.get("accept"),
      contentType: request.headers.get("content-type"),
      mcpProtocolVersion: request.headers.get("mcp-protocol-version"),
      hasMcpSessionId: !!request.headers.get("mcp-session-id"),
    });
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

  // Explicitly decline SSE channel requests in stateless/serverless mode.
  const accept = request.headers.get("accept") ?? "";
  if (request.method === "GET" && accept.includes("text/event-stream")) {
    return noContentSseResponse();
  }

  try {
    const server = createRegistryMcpServer(request);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless for serverless
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(request);

    // Figma auth probes may negotiate stream mode and receive 202, then spin on retries.
    // For stateless serverless, convert this specific probe shape into a synchronous JSON success.
    const isLikelyAuthProbe =
      request.method === "POST" &&
      !request.headers.get("mcp-session-id") &&
      hasToken &&
      (accept.includes("application/json") || accept.includes("text/event-stream")) &&
      !request.headers.get("last-event-id");
    const isLikelyStreamProbe =
      request.method === "POST" &&
      accept.includes("application/json") &&
      accept.includes("text/event-stream") &&
      !request.headers.get("mcp-session-id");
    if (response.status === 202 && (isLikelyAuthProbe || isLikelyStreamProbe)) {
      console.info("[MCP] collapsing async probe response", {
        method: request.method,
        url: request.url,
        accept,
        hasToken,
        hasMcpSessionId: !!request.headers.get("mcp-session-id"),
      });
      return Response.json(
        {
          jsonrpc: "2.0",
          result: { ok: true, authenticated: hasToken },
          id: null,
        },
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return response;
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
