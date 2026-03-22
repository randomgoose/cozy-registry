import { getOAuthClient } from "./oauth-config.js";

/** Experiment stack: OAuth + MCP under /api/x — isolated from default /.well-known + /api/mcp. */
export function xAuthorizationServerMetadata(origin: string) {
  const client = getOAuthClient();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/x/oauth/authorize`,
    token_endpoint: `${origin}/api/x/oauth/token`,
    scopes_supported: ["mcp:tools"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: client.clientSecret
      ? ["client_secret_post", "client_secret_basic"]
      : ["none", "client_secret_post", "client_secret_basic"],
  };
}

export function xProtectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/x/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["mcp:tools"],
  };
}
