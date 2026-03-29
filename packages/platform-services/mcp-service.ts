import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getAuthContextFromToken } from "@cozy/auth-control/auth-api";
import { createRegistryMcpServer } from "@cozy/mcp/mcp-tools";

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

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

function readJsonRpcInfoFromParsed(body: unknown): {
  method: string | null;
  isNonEmptyBatch: boolean;
  rpcId: JsonRpcId;
} {
  try {
    if (body === undefined || body === null) {
      return { method: null, isNonEmptyBatch: false, rpcId: null };
    }
    if (Array.isArray(body)) {
      if (body.length === 0) {
        return { method: null, isNonEmptyBatch: false, rpcId: null };
      }
      const first = body[0];
      const m =
        first &&
        typeof first === "object" &&
        typeof (first as { method?: unknown }).method === "string"
          ? (first as { method: string }).method
          : null;
      return {
        method: m,
        isNonEmptyBatch: true,
        rpcId: extractMessageId(first),
      };
    }
    if (typeof body === "object") {
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

export async function handleMcpHttpRequest(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const hasToken = !!extractBearerToken(authHeader);
  const accept = request.headers.get("accept") ?? "";
  const mcpProtocolVersion = request.headers.get("mcp-protocol-version");

  let rpcMethod: string | null = null;
  let isNonEmptyBatch = false;
  let rpcId: JsonRpcId = null;
  let postJsonText: string | null = null;
  let postParsedBody: unknown = undefined;
  let postJsonParseFailed = false;

  if (request.method === "POST") {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      postJsonText = await request.text();
      const trimmed = postJsonText.trim();
      if (trimmed.length === 0) {
        postParsedBody = null;
      } else {
        try {
          postParsedBody = JSON.parse(trimmed) as unknown;
        } catch {
          postJsonParseFailed = true;
          postParsedBody = undefined;
        }
      }
      if (!postJsonParseFailed) {
        const info = readJsonRpcInfoFromParsed(postParsedBody);
        rpcMethod = info.method;
        isNonEmptyBatch = info.isNonEmptyBatch;
        rpcId = info.rpcId;
      }
    }
  }

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

  if (request.method === "GET" && accept.includes("text/event-stream")) {
    return noContentSseResponse();
  }

  const isLikelyAuthProbe =
    request.method === "POST" &&
    hasToken &&
    accept.includes("application/json") &&
    postJsonText !== null &&
    !postJsonParseFailed &&
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
      mcpProtocolVersion,
    });
    return jsonRpcResponse(
      200,
      { result: { ok: true, authenticated: true } },
      rpcId,
    );
  }

  try {
    const requestForTransport =
      postJsonText !== null
        ? new Request(
            request.url,
            {
              method: "POST",
              headers: request.headers,
              body: postJsonText,
              duplex: "half",
            } as RequestInit & { duplex: "half" },
          )
        : request;

    const reqForMcp = ensureStreamableHttpAccept(requestForTransport);
    if (reqForMcp !== requestForTransport) {
      console.info("[MCP] merged Accept for Streamable HTTP compatibility", {
        url: request.url,
        originalAccept: accept || "(empty)",
      });
    }
    const server = createRegistryMcpServer(reqForMcp);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const handleOpts =
      postJsonText !== null && !postJsonParseFailed
        ? { parsedBody: postParsedBody }
        : undefined;
    return await transport.handleRequest(reqForMcp, handleOpts);
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

export function mcpCorsPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function withMcpCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(res.body, { status: res.status, headers });
}
