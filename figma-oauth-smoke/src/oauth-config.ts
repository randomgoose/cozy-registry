const FIGMA_REDIRECT = "https://www.figma.com/oauth/mcp/callback";

export function getOAuthClient() {
  return {
    clientId: process.env.OAUTH_CLIENT_ID ?? "cozy-figma-make",
    clientSecret: process.env.OAUTH_CLIENT_SECRET ?? "",
    redirectUris: [FIGMA_REDIRECT],
  };
}

export function validateClient(clientId: string, redirectUri: string): boolean {
  const c = getOAuthClient();
  return c.clientId === clientId && c.redirectUris.includes(redirectUri);
}
