import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { db } from "./db";
import { oauthAuthorizationCode, apiKey } from "./db/schema";
import { eq } from "drizzle-orm";

const COZY_FIGMA_CLIENT_ID = process.env.OAUTH_FIGMA_CLIENT_ID ?? "cozy-figma-make";
const COZY_FIGMA_CLIENT_SECRET = process.env.OAUTH_FIGMA_CLIENT_SECRET ?? "";
const FIGMA_REDIRECT_URI = "https://www.figma.com/oauth/mcp/callback";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
const API_KEY_PREFIX = "vbr_";

/**
 * Public origin from env only. Used when there is no incoming Request (e.g. CLI).
 *
 * Note: `NEXT_PUBLIC_*` is inlined at **build time** in Next.js. If you change it in
 * Vercel without a new deployment, bundles may still fall through to `VERCEL_URL`.
 */
export function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
    "http://localhost:3000"
  );
}

/**
 * Prefer the Host the client actually used (custom domain on Vercel, etc.) so OAuth /
 * MCP metadata match the MCP URL users configure in Figma.
 */
export function getCanonicalBaseUrlFromRequest(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",")[0]?.trim() || request.headers.get("host")?.trim();
  if (!host) {
    return getBaseUrl();
  }
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function getMcpResourceUrl(): string {
  return `${getBaseUrl()}/api/mcp`;
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

  if ((params.codeChallengeMethod ?? "plain") === "S256") {
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

/** Consume code and return userId; deletes the code. Returns null if invalid. */
export async function consumeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier?: string | null
): Promise<string | null> {
  const [row] = await db
    .select({ userId: oauthAuthorizationCode.userId })
    .from(oauthAuthorizationCode)
    .where(eq(oauthAuthorizationCode.code, code));

  if (!row) return null;

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
  return full.userId;
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
