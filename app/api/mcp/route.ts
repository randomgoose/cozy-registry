import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRegistryMcpServer } from "@/lib/mcp-tools";

// Stateless mode: create fresh server + transport per request (required for serverless).
// Reusing stateless transport causes message ID collisions.
async function handleMcpRequest(request: Request): Promise<Response> {
  try {
    const server = createRegistryMcpServer(request);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless for serverless
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[MCP] handleRequest error:", message);
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
