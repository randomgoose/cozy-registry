import type { TokenAuthContext } from "@cozy/auth-control/auth-api";

type SessionLike =
  | {
      user?: { id?: string | null } | null;
      session?: {
        activeOrganizationId?: string | null;
        activeTeamId?: string | null;
      } | null;
    }
  | null
  | undefined;

export type PlatformSessionContext = {
  userId: string | null;
  activeOrganizationId: string | null;
  activeTeamId: string | null;
};

export type PlatformRequestContext = PlatformSessionContext & {
  apiKeyId: string | null;
  authSource: "anonymous" | "session" | "token";
};

export function getPlatformSessionContext(
  session: SessionLike,
): PlatformSessionContext {
  return {
    userId: session?.user?.id ?? null,
    activeOrganizationId: session?.session?.activeOrganizationId ?? null,
    activeTeamId: session?.session?.activeTeamId ?? null,
  };
}

export function buildPlatformRequestContext(input: {
  session: PlatformSessionContext;
  token: TokenAuthContext | null;
}): PlatformRequestContext {
  if (input.token) {
    return {
      userId: input.token.userId,
      apiKeyId: input.token.apiKeyId,
      activeOrganizationId: null,
      activeTeamId: null,
      authSource: "token",
    };
  }

  if (input.session.userId) {
    return {
      ...input.session,
      apiKeyId: null,
      authSource: "session",
    };
  }

  return {
    ...input.session,
    apiKeyId: null,
    authSource: "anonymous",
  };
}
