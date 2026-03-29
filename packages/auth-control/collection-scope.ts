import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";

export type CollectionScopeContext = {
  userId: string | null;
  activeTeamId: string | null;
};

export async function getCollectionScopeContext(
  request: Request,
): Promise<CollectionScopeContext> {
  const context = await getPlatformRequestContext(request);

  return {
    userId: context.userId,
    activeTeamId: context.activeTeamId,
  };
}
