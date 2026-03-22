import { requestOrigin } from "./metadata.js";

/**
 * Inspect how the deployment sees its public URL (Railway / proxies).
 * Does not touch OAuth — safe to curl anytime.
 */
export function diagPublicUrl(request: Request): Record<string, unknown> {
  const origin = requestOrigin(request);
  return {
    note: "Use this to verify origin matches Figma resource= and MCP URL host.",
    computedOrigin: origin,
    requestUrl: request.url,
    headers: {
      "x-forwarded-host": request.headers.get("x-forwarded-host"),
      "x-forwarded-proto": request.headers.get("x-forwarded-proto"),
      host: request.headers.get("host"),
    },
    defaultMcpResource: `${origin}/api/mcp`,
    experimentMcpResource: `${origin}/api/x/mcp`,
    experimentPrmUrl: `${origin}/api/x/well-known/oauth-protected-resource`,
  };
}
