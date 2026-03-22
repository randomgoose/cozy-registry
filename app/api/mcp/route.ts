import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRegistryMcpServer } from "@/lib/mcp-tools";
import { getAuthContextFromToken } from "@/lib/auth-api";

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

type JsonRpcId = string | number | null;

function extractMessageId(msg: unknown): JsonRpcId {
  if (!msg || typeof msg !== "object" || !("id" in msg)) return null;
  const id = (msg as { id?: unknown }).id;
  if (id === null || typeof id === "string" || typeof id === "number") return id;
  return null;
}

/**
 * Parse JSON-RPC shape from body (single object or batch). Figma may send batch `[initialize]`;
 * treating that as an empty "auth probe" breaks verification (wrong response id / wrong result).
 */
async function readJsonRpcInfo(request: Request): Promise<{
  method: string | null;
  isNonEmptyBatch: boolean;
  rpcId: JsonRpcId;
}> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { method: null, isNonEmptyBatch: false, rpcId: null };
    }
    const body: unknown = await request.clone().json();
    if (Array.isArray(body)) {
      if (body.length === 0) {
        return { method: null, isNonEmptyBatch: false, rpcId: null };
      }
      const first = body[0];
      const m =
        first && typeof first === "object" && typeof (first as { method?: unknown }).method === "string"
          ? (first as { method: string }).method
          : null;
      return {
        method: m,
        isNonEmptyBatch: true,
        rpcId: extractMessageId(first),
      };
    }
    if (body && typeof body === "object") {
      const m =
        typeof (body as { method?: unknown }).method === "string"
          ? (body as { method: string }).method
          : null;
      return {
        method: m,
        isNonEmptyBatch: false,
        rpcId: extractMessageId(body),
      };
    }
    return { method: null, isNonEmptyBatch: false, rpcId: null };
  } catch {
    return { method: null, isNonEmptyBatch: false, rpcId: null };
  }
}

function jsonRpcResponse(
  status: number,
  payload: { result?: unknown; error?: { code: number; message: string } },
  id: JsonRpcId,
  extraHeaders?: Record<string, string>,
): Response {
  const body =
    payload.error !== undefined
      ? { jsonrpc: "2.0" as const, error: payload.error, id }
      : { jsonrpc: "2.0" as const, result: payload.result, id };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

/**
 * Streamable HTTP transport requires Accept to list BOTH application/json and text/event-stream.
 * Figma Make's post-OAuth verification often sends only application/json → SDK returns 406 and the
 * client spins on check_auth until rate-limited. Merge Accept before delegating to the SDK.
 */
function ensureStreamableHttpAccept(req: Request): Request {
  if (req.method !== "POST") return req;
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) {
    return req;
  }
  const tokens = new Set(
    accept
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (![...tokens].some((t) => t.includes("application/json"))) {
    tokens.add("application/json");
  }
  if (![...tokens].some((t) => t.includes("text/event-stream"))) {
    tokens.add("text/event-stream");
  }
  const headers = new Headers(req.headers);
  headers.set("accept", [...tokens].join(", "));
  return new Request(req.url, {
    method: req.method,
    headers,
    body: req.body,
    ...(req.body ? { duplex: "half" as const } : {}),
  });
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const hasToken = !!extractBearerToken(authHeader);
  const accept = request.headers.get("accept") ?? "";
  const mcpProtocolVersion = request.headers.get("mcp-protocol-version");
  const hasMcpSessionId = !!request.headers.get("mcp-session-id");
  const { method: rpcMethod, isNonEmptyBatch, rpcId } = await readJsonRpcInfo(request);

  if (!hasToken) {
    const baseUrl = new URL(request.url).origin;
    const prmUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
    console.warn("[MCP] missing bearer token", {
      method: request.method,
      url: request.url,
      userAgent: request.headers.get("user-agent"),
      accept,
      contentType: request.headers.get("content-type"),
      mcpProtocolVersion,
      hasMcpSessionId,
    });
    return jsonRpcResponse(
      401,
      {
        error: {
          code: -32001,
          message: "Authorization required. Use OAuth or Bearer token.",
        },
      },
      rpcId,
      {
        "WWW-Authenticate": `Bearer realm="cozy-registry", resource_metadata="${prmUrl}"`,
      },
    );
  }

  // Explicitly decline SSE channel requests in stateless/serverless mode.
  if (request.method === "GET" && accept.includes("text/event-stream")) {
    return noContentSseResponse();
  }

  // Ping-style POST with no JSON-RPC method: not a batch (Figma may send initialize as a one-element array).
  // Do not require absence of mcp-protocol-version — some clients send it on every POST.
  const isLikelyAuthProbe =
    request.method === "POST" &&
    hasToken &&
    !hasMcpSessionId &&
    accept.includes("application/json") &&
    !isNonEmptyBatch &&
    !rpcMethod;

  if (isLikelyAuthProbe) {
    const ctx = await getAuthContextFromToken(request);
    if (!ctx) {
      const baseUrl = new URL(request.url).origin;
      const prmUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
      return jsonRpcResponse(
        401,
        {
          error: {
            code: -32001,
            message: "Invalid or expired token.",
          },
        },
        rpcId,
        {
          "WWW-Authenticate": `Bearer realm="cozy-registry", resource_metadata="${prmUrl}"`,
        },
      );
    }
    console.info("[MCP] short-circuiting auth probe", {
      method: request.method,
      url: request.url,
      rpcMethod,
      accept,
      hasToken,
      hasMcpSessionId,
      mcpProtocolVersion,
    });
    return jsonRpcResponse(
      200,
      { result: { ok: true, authenticated: true } },
      rpcId,
    );
  }

  try {
    const reqForMcp = ensureStreamableHttpAccept(request);
    if (reqForMcp !== request) {
      console.info("[MCP] merged Accept for Streamable HTTP compatibility", {
        url: request.url,
        originalAccept: accept || "(empty)",
      });
    }
    const server = createRegistryMcpServer(reqForMcp);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless for serverless
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(reqForMcp);

    // Notification-only POSTs (e.g. notifications/initialized) get 202 + empty body per MCP
    // Streamable HTTP. Do not rewrite to 200 JSON-RPC — clients like Figma expect 202 and will
    // retry forever if the response shape is wrong.

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
    return jsonRpcResponse(
      500,
      { error: { code: -32603, message: `Internal error: ${message}` } },
      rpcId,
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
