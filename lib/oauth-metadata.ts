import { getBaseUrl, getOAuthClient } from "@/lib/oauth";

export function getAuthorizationServerMetadata(baseUrl: string = getBaseUrl()) {
  const client = getOAuthClient();

  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    scopes_supported: ["mcp:tools"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: client.clientSecret
      ? ["client_secret_post", "client_secret_basic"]
      : ["none", "client_secret_post", "client_secret_basic"],
    authorization_response_iss_parameter_supported: true,
  };
}

export function getProtectedResourceMetadata(baseUrl: string = getBaseUrl()) {
  return {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:tools"],
  };
}
