import { createHmac, timingSafeEqual } from "node:crypto";

export function getOAuthRefreshSigningSecret(): string {
  const s =
    process.env.OAUTH_REFRESH_TOKEN_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (!s) {
    throw new Error(
      "Set BETTER_AUTH_SECRET or OAUTH_REFRESH_TOKEN_SECRET to issue OAuth refresh tokens",
    );
  }
  return s;
}

function signPayload(b64Payload: string): string {
  return createHmac("sha256", getOAuthRefreshSigningSecret()).update(b64Payload).digest("base64url");
}

export function signOAuthRefreshPayload(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(b64);
  return `${b64}.${sig}`;
}

export function verifyOAuthRefreshPayload<T>(token: string): T | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPayload(b64);
  try {
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
