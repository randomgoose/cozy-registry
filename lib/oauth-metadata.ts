import { getBaseUrl, getMcpResourceUrl, getOAuthClient } from "@/lib/oauth";

export function getAuthorizationServerMetadata() {
  const baseUrl = getBaseUrl();
  const client = getOAuthClient();

  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    scopes_supported: ["mcp:tools"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: client.clientSecret
      ? ["client_secret_post", "client_secret_basic"]
      : ["none", "client_secret_post", "client_secret_basic"],
  };
}

export function getProtectedResourceMetadata() {
  const baseUrl = getBaseUrl();

  return {
    resource: getMcpResourceUrl(),
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:tools"],
  };
}
