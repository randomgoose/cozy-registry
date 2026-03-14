import { auth } from "./auth";

/**
 * Validate Bearer token from Authorization header or x-api-key.
 * Returns { userId } if valid, null otherwise.
 */
export async function getUserIdFromToken(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : request.headers.get("x-api-key");
  if (!token) return null;

  try {
    const result = await auth.api.verifyApiKey({
      body: { key: token },
    });
    if (result.valid && result.key) {
      return result.key.referenceId;
    }
  } catch {
    // ignore
  }
  return null;
}
