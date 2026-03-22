import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  return process.env.OAUTH_CODE_SIGNING_SECRET ?? "change-me-in-production";
}

function signPayload(b64Payload: string): string {
  return createHmac("sha256", getSecret()).update(b64Payload).digest("base64url");
}

export function signObject(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(b64);
  return `${b64}.${sig}`;
}

export function verifySignedObject<T>(token: string): T | null {
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
