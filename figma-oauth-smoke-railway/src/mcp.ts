import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { verifySignedObject } from "./crypto.js";

type JsonRpcId = string | number | null;

function extractBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

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
      if (body.length === 0) return { method: null, isNonEmptyBatch: false, rpcId: null };
      const first = body[0];
      const m =
        first && typeof first === "object" && typeof (first as { method?: unknown }).method === "string"
          ? (first as { method: string }).method
          : null;
      return { method: m, isNonEmptyBatch: true, rpcId: extractMessageId(first) };
    }
    if (typeof body === "object") {
      const m =
        typeof (body as { method?: unknown }).method === "string"
          ? (body as { method: string }).method
          : null;
      return { method: m, isNonEmptyBatch: false, rpcId: extractMessageId(body) };
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
  extra?: Record<string, string>,
): Response {
  const body =
    payload.error !== undefined
      ? { jsonrpc: "2.0" as const, error: payload.error, id }
      : { jsonrpc: "2.0" as const, result: payload.result, id };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function noContentSse(): Response {
  return new Response("event: close\ndata: {}\n\n", {
    status: 200,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
    },
  });
}

function ensureStreamableHttpAccept(req: Request): Request {
  if (req.method !== "POST") return req;
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) return req;
  const tokens = new Set(
    accept
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (![...tokens].some((t) => t.includes("application/json"))) tokens.add("application/json");
  if (![...tokens].some((t) => t.includes("text/event-stream"))) tokens.add("text/event-stream");
  const headers = new Headers(req.headers);
  headers.set("accept", [...tokens].join(", "));
  return new Request(req.url, {
    method: req.method,
    headers,
    body: req.body,
    ...(req.body ? ({ duplex: "half" } as RequestInit & { duplex: "half" }) : {}),
  });
}

function verifyAccessToken(token: string): boolean {
  const p = verifySignedObject<{ typ?: string; exp?: number }>(token);
  if (!p || p.typ !== "at" || typeof p.exp !== "number") return false;
  return p.exp > Date.now();
}

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  return new Response(res.body, { status: res.status, headers: h });
}

async function logTransportResponse(response: Response, ctx: { rpcMethod: string | null }): Promise<void> {
  const st = response.status;
  const ct = response.headers.get("content-type") ?? "";
  const entry: Record<string, unknown> = {
    mcp: "transport",
    httpStatus: st,
    rpcMethod: ctx.rpcMethod,
    contentType: ct,
  };
  if ((st === 200 || st === 202) && (ct.includes("json") || ct.includes("application/json"))) {
    try {
      const text = await response.clone().text();
      if (text.length > 0) {
        entry.bodySnippet = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
        if (text.includes('"error"')) entry.jsonRpcHasErrorKey = true;
      }
    } catch {
      entry.bodyReadFailed = true;
    }
  }
  console.info("[MCP] transport response", entry);
}

function createSmokeServer(): McpServer {
  const server = new McpServer({ name: "figma-oauth-smoke-railway", version: "0.0.1" });
  server.registerTool(
    "ping",
    { title: "Ping", description: "Smoke-test tool", inputSchema: z.object({}) },
    async () => ({
      content: [{ type: "text" as const, text: "pong" }],
    }),
  );
  return server;
}

export type McpRequestOptions = {
  /** Full URL in WWW-Authenticate resource_metadata (default: origin + /.well-known/oauth-protected-resource) */
  resourceMetadataUrl?: string;
  realm?: string;
};

export async function handleMcpRequest(
  request: Request,
  origin: string,
  options: McpRequestOptions = {},
): Promise<Response> {
  const prmUrl =
    options.resourceMetadataUrl ?? `${origin}/.well-known/oauth-protected-resource`;
  const realm = options.realm ?? "figma-oauth-smoke-railway";
  const authHeader = request.headers.get("authorization");
  const token = extractBearer(authHeader);
  const hasToken = Boolean(token);
  const accept = request.headers.get("accept") ?? "";

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

  if (!hasToken || !token || !verifyAccessToken(token)) {
    return withCors(
      jsonRpcResponse(
        401,
        {
          error: {
            code: -32001,
            message: "Authorization required. Use OAuth or Bearer token.",
          },
        },
        rpcId,
        { "WWW-Authenticate": `Bearer realm="${realm}", resource_metadata="${prmUrl}"` },
      ),
    );
  }

  if (request.method === "GET" && accept.includes("text/event-stream")) {
    return withCors(noContentSse());
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
    console.info("[MCP] auth_probe_short_circuit", { rpcId });
    return withCors(
      jsonRpcResponse(200, { result: { ok: true, authenticated: true } }, rpcId),
    );
  }

  try {
    const requestForTransport =
      postJsonText !== null
        ? new Request(request.url, {
            method: "POST",
            headers: request.headers,
            body: postJsonText,
            duplex: "half",
          } as RequestInit & { duplex: "half" })
        : request;

    const reqForMcp = ensureStreamableHttpAccept(requestForTransport);
    const server = createSmokeServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const handleOpts =
      postJsonText !== null && !postJsonParseFailed ? { parsedBody: postParsedBody } : undefined;
    const response = await transport.handleRequest(reqForMcp, handleOpts);
    await logTransportResponse(response, { rpcMethod });
    return withCors(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return withCors(
      jsonRpcResponse(
        500,
        { error: { code: -32603, message: `Internal error: ${message}` } },
        rpcId,
      ),
    );
  }
}

export function mcpOptionsResponse(): Response {
  return withCors(
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
        "Access-Control-Max-Age": "86400",
      },
    }),
  );
}
