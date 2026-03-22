import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { db } from "./db";
import { oauthAuthorizationCode, apiKey } from "./db/schema";
import { eq } from "drizzle-orm";
import { signOAuthRefreshPayload, verifyOAuthRefreshPayload } from "./oauth-refresh-crypto";

const COZY_FIGMA_CLIENT_ID = process.env.OAUTH_FIGMA_CLIENT_ID ?? "cozy-figma-make";
const COZY_FIGMA_CLIENT_SECRET = process.env.OAUTH_FIGMA_CLIENT_SECRET ?? "";
const FIGMA_REDIRECT_URI = "https://www.figma.com/oauth/mcp/callback";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
/** Align token response `expires_in` (seconds) with refresh token lifetime. */
export const OAUTH_ACCESS_EXPIRES_IN_SEC = 31536000;
const REFRESH_TTL_MS = OAUTH_ACCESS_EXPIRES_IN_SEC * 1000;
const API_KEY_PREFIX = "vbr_";

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

/**
 * Figma sends `resource` on authorize and sometimes on token. If present, it must match our MCP URL
 * for this host (otherwise check_auth can stay needsAuthorization after a successful-looking flow).
 */
export function validateOAuthResourceParam(
  request: Request,
  resource: string | null | undefined,
): { ok: true } | { ok: false } {
  if (resource == null || resource.trim() === "") {
    return { ok: true };
  }
  const expected = getExpectedMcpResourceUrlFromRequest(request).replace(/\/$/, "");
  const got = resource.trim().replace(/\/$/, "");
  if (got !== expected) {
    console.warn("[OAuth] resource param mismatch", { expected, got });
    return { ok: false };
  }
  return { ok: true };
}

/** Pre-registered OAuth client for Figma Make. */
export function getOAuthClient(): { clientId: string; clientSecret: string; redirectUris: string[] } {
  return {
    clientId: COZY_FIGMA_CLIENT_ID,
    clientSecret: COZY_FIGMA_CLIENT_SECRET,
    redirectUris: [FIGMA_REDIRECT_URI],
  };
}

export function validateClient(
  clientId: string,
  redirectUri: string
): { valid: boolean; error?: string } {
  const client = getOAuthClient();
  if (clientId !== client.clientId) {
    return { valid: false, error: "invalid_client" };
  }
  if (!client.redirectUris.includes(redirectUri)) {
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
    name: "Figma Make OAuth",
    prefix: API_KEY_PREFIX,
    enabled: true,
    rateLimitEnabled: false,
  });
  return plainKey;
}
