import { auth } from "@cozy/auth-runtime/auth";
import { getAuthContextFromToken } from "@cozy/auth-control/auth-api";
import {
  buildPlatformRequestContext,
  getPlatformSessionContext,
  type PlatformRequestContext,
  type PlatformSessionContext,
} from "@cozy/platform-core/platform-context";

export async function getSessionContextFromHeaders(
  headers: Headers,
): Promise<PlatformSessionContext> {
  const session = await auth.api.getSession({ headers });
  return getPlatformSessionContext(session);
}

export async function getPlatformRequestContext(
  request: Request,
): Promise<PlatformRequestContext> {
  const [session, token] = await Promise.all([
    getSessionContextFromHeaders(request.headers),
    getAuthContextFromToken(request),
  ]);

  return buildPlatformRequestContext({ session, token });
}
