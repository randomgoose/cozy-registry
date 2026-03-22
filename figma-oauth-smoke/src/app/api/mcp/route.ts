import { handleMcpRequest, mcpOptionsResponse } from "@/lib/mcp";
import { requestOrigin } from "@/lib/metadata";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleMcpRequest(request, requestOrigin(request));
}

export async function POST(request: Request) {
  return handleMcpRequest(request, requestOrigin(request));
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request, requestOrigin(request));
}

export async function OPTIONS() {
  return mcpOptionsResponse();
}
