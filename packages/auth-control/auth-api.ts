import { createHash } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@cozy/db";
import { apiKey } from "@cozy/db/schema";

export type TokenAuthContext = {
  userId: string;
  apiKeyId: string;
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function hashApiKey(plain: string): string {
  const hash = createHash("sha256").update(plain, "utf8").digest();
  return Buffer.from(hash).toString("base64url");
}

/**
 * Validate Bearer token from Authorization header or x-api-key.
 * Returns { userId, apiKeyId } if valid, null otherwise.
 */
export async function getAuthContextFromToken(
  request: Request,
): Promise<TokenAuthContext | null> {
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader) ?? request.headers.get("x-api-key");
  if (!token) return null;

  try {
    // Direct DB verification avoids Better Auth API-key rate-limit counters
    // during high-frequency MCP check_auth probes.
    const hashed = hashApiKey(token);
    const [row] = await db
      .select({
        id: apiKey.id,
        referenceId: apiKey.referenceId,
      })
      .from(apiKey)
      .where(
        and(
          eq(apiKey.key, hashed),
          eq(apiKey.enabled, true),
          or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, new Date())),
        ),
      )
      .limit(1);

    if (!row?.id || !row.referenceId) return null;
    return { userId: row.referenceId, apiKeyId: row.id };
  } catch (err) {
    console.warn(
      "[auth-api] getAuthContextFromToken DB error (treating as unauthenticated)",
      err instanceof Error ? err.message : err,
    );
  }
  return null;
}

/**
 * Backward-compatible helper for callers that only need userId.
 */
export async function getUserIdFromToken(request: Request): Promise<string | null> {
  const ctx = await getAuthContextFromToken(request);
  return ctx?.userId ?? null;
}
