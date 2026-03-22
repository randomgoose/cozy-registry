const FIGMA_REDIRECT = "https://www.figma.com/oauth/mcp/callback";

/** Same names as Cozy Registry main app so one Vercel env block can be copy-pasted. */
export function getOAuthClient() {
  const clientId =
    process.env.OAUTH_CLIENT_ID?.trim() ||
    process.env.OAUTH_FIGMA_CLIENT_ID?.trim() ||
    "cozy-figma-make";
  const clientSecret =
    process.env.OAUTH_CLIENT_SECRET?.trim() ||
    process.env.OAUTH_FIGMA_CLIENT_SECRET?.trim() ||
    "";
  return {
    clientId,
    clientSecret,
    redirectUris: [FIGMA_REDIRECT],
  };
}

export function validateClient(clientId: string, redirectUri: string): boolean {
  const c = getOAuthClient();
  return c.clientId === clientId && c.redirectUris.includes(redirectUri);
}
