import {
  handleMcpHttpRequest,
  mcpCorsPreflightResponse,
  withMcpCors,
} from "@cozy/platform-services/mcp-service";

export async function handlePlatformMcpRoute(request: Request): Promise<Response> {
  return withMcpCors(await handleMcpHttpRequest(request));
}

export async function handlePlatformMcpOptionsRoute(): Promise<Response> {
  return mcpCorsPreflightResponse();
}
