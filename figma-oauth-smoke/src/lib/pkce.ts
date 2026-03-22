import { createHash, timingSafeEqual } from "node:crypto";

function createPkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
}

export function validatePkce(params: {
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  codeVerifier?: string | null;
}): boolean {
  if (!params.codeChallenge) return true;
  if (!params.codeVerifier) return false;
  const method = (params.codeChallengeMethod ?? "plain").toLowerCase();
  if (method === "s256") {
    const expected = Buffer.from(params.codeChallenge, "utf8");
    const actual = Buffer.from(createPkceChallenge(params.codeVerifier), "utf8");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
  const expected = Buffer.from(params.codeChallenge, "utf8");
  const actual = Buffer.from(params.codeVerifier, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
