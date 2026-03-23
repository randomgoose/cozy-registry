import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { db } from "./db";
import { oauthAuthorizationCode, apiKey } from "./db/schema";
import { eq } from "drizzle-orm";
import { signOAuthRefreshPayload, verifyOAuthRefreshPayload } from "./oauth-refresh-crypto";

const COZY_FIGMA_CLIENT_ID = process.env.OAUTH_FIGMA_CLIENT_ID ?? "cozy-figma-make";
const COZY_FIGMA_CLIENT_SECRET = process.env.OAUTH_FIGMA_CLIENT_SECRET ?? "";
const COZY_CURSOR_CLIENT_ID = process.env.OAUTH_CURSOR_CLIENT_ID ?? "cozy-cursor";
const COZY_CURSOR_CLIENT_SECRET = process.env.OAUTH_CURSOR_CLIENT_SECRET ?? "";
const FIGMA_REDIRECT_URI = "https://www.figma.com/oauth/mcp/callback";
const CURSOR_CALLBACK_URI = "cursor://anysphere.cursor-mcp/oauth/callback";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
/** Align token response `expires_in` (seconds) with refresh token lifetime. */
export const OAUTH_ACCESS_EXPIRES_IN_SEC = 31536000;
const REFRESH_TTL_MS = OAUTH_ACCESS_EXPIRES_IN_SEC * 1000;
const API_KEY_PREFIX = "vbr_";

export type OAuthTool = "figma-make" | "cursor";
export type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  redirectUriPrefixes?: string[];
  tool: OAuthTool;
  tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic";
};

type OAuthRefreshTokenPayload = {
  typ: "rt";
  v: 1;
  exp: number;
  userId: string;
  clientId: string;
  scope: string | null;
};

function originFromEnvUrl(url: string): string {
  return new URL(url).origin;
}

function parseRedirectUris(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Public site URL for links and metadata (no Request). Prefer explicit env on PaaS. */
export function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (explicit) {
    try {
      return originFromEnvUrl(explicit);
    } catch {
      /* ignore */
    }
  }
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    const host = railway.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    return `https://${host}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

/**
 * Origin as the browser / Figma sees it. Behind Railway, Vercel, etc., `request.url` is often an
 * internal host or http: — then `resource` from Figma (public https URL) fails validation and
 * PRM/WWW-Authenticate URLs are wrong.
 */
export function getCanonicalBaseUrlFromRequest(request: Request): string {
  try {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedHost) {
      const host = forwardedHost.split(",")[0]?.trim();
      if (host) {
        const proto = forwardedProto?.split(",")[0]?.trim() || "https";
        return `${proto}://${host}`;
      }
    }

    const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
    if (envUrl) {
      return originFromEnvUrl(envUrl);
    }

    const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railway) {
      const host = railway.replace(/^https?:\/\//i, "").replace(/\/$/, "");
      return `https://${host}`;
    }

    return new URL(request.url).origin;
  } catch {
    return getBaseUrl();
  }
}

export function getMcpResourceUrl(): string {
  return `${getBaseUrl()}/api/mcp`;
}

/** Expected MCP resource URL for this deployment (RFC 8707 / Figma Make). */
export function getExpectedMcpResourceUrlFromRequest(request: Request): string {
  return `${getCanonicalBaseUrlFromRequest(request)}/api/mcp`;
}

function normalizeMcpResourceUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/**
 * Plausible MCP resource URLs for this deployment. OAuth clients (Figma, Cursor) often send
 * `resource` from connector config (`NEXT_PUBLIC_APP_URL` / custom domain) while individual
 * requests may resolve a different canonical host when `x-forwarded-host` is missing or varies
 * between edge and origin — strict single-URL checks then fail intermittently.
 */
export function getExpectedMcpResourceUrlsFromRequest(request: Request): string[] {
  const set = new Set<string>();
  set.add(normalizeMcpResourceUrl(getExpectedMcpResourceUrlFromRequest(request)));
  set.add(normalizeMcpResourceUrl(getMcpResourceUrl()));
  return [...set];
}

/**
 * Figma sends `resource` on authorize and sometimes on token. If present, it must match one of
 * this deployment’s MCP URLs (see {@link getExpectedMcpResourceUrlsFromRequest}).
 */
export function validateOAuthResourceParam(
  request: Request,
  resource: string | null | undefined,
): { ok: true } | { ok: false } {
  if (resource == null || resource.trim() === "") {
    return { ok: true };
  }
  const got = normalizeMcpResourceUrl(resource);
  const candidates = getExpectedMcpResourceUrlsFromRequest(request);
  if (!candidates.includes(got)) {
    console.warn("[OAuth] resource param mismatch", { candidates, got });
    return { ok: false };
  }
  return { ok: true };
}

/** Pre-registered OAuth client for Figma Make. */
export function getOAuthClients(): OAuthClientConfig[] {
  const cursorRedirectUris = parseRedirectUris(process.env.OAUTH_CURSOR_REDIRECT_URIS);
  const cursorRedirectUriPrefixes = parseRedirectUris(
    process.env.OAUTH_CURSOR_REDIRECT_URI_PREFIXES
  );
  const cursorTokenEndpointAuthMethodRaw = (
    process.env.OAUTH_CURSOR_TOKEN_ENDPOINT_AUTH_METHOD ?? ""
  )
    .trim()
    .toLowerCase();
  const cursorTokenEndpointAuthMethod =
    cursorTokenEndpointAuthMethodRaw === "client_secret_post" ||
    cursorTokenEndpointAuthMethodRaw === "client_secret_basic" ||
    cursorTokenEndpointAuthMethodRaw === "none"
      ? cursorTokenEndpointAuthMethodRaw
      : COZY_CURSOR_CLIENT_SECRET
        ? "client_secret_post"
        : "none";
  const resolvedCursorRedirectUriPrefixes =
    cursorRedirectUriPrefixes.length > 0
      ? cursorRedirectUriPrefixes
      : ["cursor://anysphere.cursor-mcp/oauth/"];
  const resolvedCursorRedirectUris =
    cursorRedirectUris.length > 0 ? cursorRedirectUris : [CURSOR_CALLBACK_URI];

  const clients: OAuthClientConfig[] = [
    {
      clientId: COZY_FIGMA_CLIENT_ID,
      clientSecret: COZY_FIGMA_CLIENT_SECRET,
      redirectUris: [FIGMA_REDIRECT_URI],
      tool: "figma-make",
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      clientId: COZY_CURSOR_CLIENT_ID,
      clientSecret: COZY_CURSOR_CLIENT_SECRET,
      redirectUris: resolvedCursorRedirectUris,
      redirectUriPrefixes: resolvedCursorRedirectUriPrefixes,
      tool: "cursor",
      tokenEndpointAuthMethod: cursorTokenEndpointAuthMethod,
    },
  ];

  return clients.filter((client) => client.clientId.trim().length > 0);
}

export function getOAuthClient(clientId?: string | null): OAuthClientConfig {
  if (clientId) {
    const match = getOAuthClients().find((client) => client.clientId === clientId);
    if (match) return match;
  }

  return (
    getOAuthClients().find((client) => client.tool === "figma-make") ??
    getOAuthClients()[0] ?? {
      clientId: COZY_FIGMA_CLIENT_ID,
      clientSecret: COZY_FIGMA_CLIENT_SECRET,
      redirectUris: [FIGMA_REDIRECT_URI],
      tool: "figma-make",
      tokenEndpointAuthMethod: "client_secret_post",
    }
  );
}

function matchesRedirectUri(client: OAuthClientConfig, redirectUri: string): boolean {
  if (client.redirectUris.includes(redirectUri)) return true;
  return (client.redirectUriPrefixes ?? []).some((prefix) => redirectUri.startsWith(prefix));
}

export function getOAuthClientByRedirectUri(redirectUri: string): OAuthClientConfig | null {
  return (
    getOAuthClients().find((client) => matchesRedirectUri(client, redirectUri)) ??
    null
  );
}

export function selectOAuthClientForRegistration(body: Record<string, unknown>): OAuthClientConfig {
  const requestedClientId =
    typeof body.client_id === "string" ? body.client_id.trim() : "";
  if (requestedClientId) {
    return getOAuthClient(requestedClientId);
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  const matchedByRedirect = redirectUris
    .map((uri) => getOAuthClientByRedirectUri(uri))
    .find((client): client is OAuthClientConfig => !!client);

  return matchedByRedirect ?? getOAuthClient();
}

export function validateClient(
  clientId: string,
  redirectUri: string
): { valid: boolean; error?: string } {
  const client = getOAuthClient(clientId);
  if (clientId !== client.clientId) {
    return { valid: false, error: "invalid_client" };
  }
  if (!matchesRedirectUri(client, redirectUri)) {
    return { valid: false, error: "invalid_redirect_uri" };
  }
  return { valid: true };
}

/** SHA-256 + base64url (no padding), same as Better Auth api-key plugin. */
function hashKey(plain: string): string {
  const hash = createHash("sha256").update(plain, "utf8").digest();
  return Buffer.from(hash).toString("base64url");
}

function generateSecureToken(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url").replace(/[^a-zA-Z0-9]/g, "");
}

/** Create authorization code; returns the code string. */
export async function createAuthorizationCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope?: string | null;
  state?: string | null;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
}): Promise<string> {
  const code = generateSecureToken(24);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.insert(oauthAuthorizationCode).values({
    code,
    userId: params.userId,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    scope: params.scope ?? null,
    state: params.state ?? null,
    codeChallenge: params.codeChallenge ?? null,
    codeChallengeMethod: params.codeChallengeMethod ?? null,
    expiresAt,
  });
  return code;
}

function createPkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
}

function validatePkce(params: {
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  codeVerifier?: string | null;
}): boolean {
  if (!params.codeChallenge) {
    return true;
  }

  if (!params.codeVerifier) {
    return false;
  }

  const method = (params.codeChallengeMethod ?? "plain").toLowerCase();
  if (method === "s256") {
    const expected = Buffer.from(params.codeChallenge, "utf8");
    const actual = Buffer.from(createPkceChallenge(params.codeVerifier), "utf8");

    if (expected.length !== actual.length) {
      return false;
    }

    return timingSafeEqual(expected, actual);
  }

  const expected = Buffer.from(params.codeChallenge, "utf8");
  const actual = Buffer.from(params.codeVerifier, "utf8");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

/** Consume code and return user + scope; deletes the code. Returns null if invalid. */
export async function consumeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier?: string | null
): Promise<{ userId: string; scope: string | null } | null> {
  const [full] = await db
    .select()
    .from(oauthAuthorizationCode)
    .where(eq(oauthAuthorizationCode.code, code));

  if (!full || full.clientId !== clientId || full.redirectUri !== redirectUri) return null;
  if (full.expiresAt < new Date()) return null;
  if (
    !validatePkce({
      codeChallenge: full.codeChallenge ?? null,
      codeChallengeMethod: full.codeChallengeMethod ?? null,
      codeVerifier,
    })
  ) {
    return null;
  }

  await db.delete(oauthAuthorizationCode).where(eq(oauthAuthorizationCode.code, code));
  return { userId: full.userId, scope: full.scope ?? null };
}

/** Signed opaque refresh token (rotation on each use). */
export function mintOAuthRefreshToken(params: {
  userId: string;
  clientId: string;
  scope: string | null;
}): string {
  const payload: OAuthRefreshTokenPayload = {
    typ: "rt",
    v: 1,
    exp: Date.now() + REFRESH_TTL_MS,
    userId: params.userId,
    clientId: params.clientId,
    scope: params.scope,
  };
  return signOAuthRefreshPayload(payload);
}

export function parseOAuthRefreshToken(
  token: string
): { userId: string; clientId: string; scope: string | null } | null {
  const p = verifyOAuthRefreshPayload<OAuthRefreshTokenPayload>(token);
  if (!p || p.typ !== "rt" || p.v !== 1 || typeof p.exp !== "number" || p.exp < Date.now()) {
    return null;
  }
  if (typeof p.userId !== "string" || typeof p.clientId !== "string") return null;
  return { userId: p.userId, clientId: p.clientId, scope: p.scope ?? null };
}

/** Create an API key for the user and return the plain key (to use as OAuth access_token). */
export async function createApiKeyForOAuth(userId: string): Promise<string> {
  const plainKey = `${API_KEY_PREFIX}${generateSecureToken(32)}`;
  const hashedKey = hashKey(plainKey);
  const id = crypto.randomUUID();
  await db.insert(apiKey).values({
    id,
    configId: "default",
    referenceId: userId,
    key: hashedKey,
    name: "OAuth Access Token",
    prefix: API_KEY_PREFIX,
    enabled: true,
    rateLimitEnabled: false,
  });
  return plainKey;
}
