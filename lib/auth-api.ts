import { auth } from "./auth";

export type TokenAuthContext = {
  userId: string;
  apiKeyId: string;
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
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
    const result = await auth.api.verifyApiKey({
      body: { key: token },
    });
    if (result.valid && result.key) {
      const apiKeyId = (result.key as unknown as { id?: string }).id;
      const userId = result.key.referenceId;
      if (!apiKeyId || !userId) return null;
      return { userId, apiKeyId };
    }
  } catch {
    // ignore
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
