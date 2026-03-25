import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-api";

export type CollectionScopeContext = {
  userId: string | null;
  activeTeamId: string | null;
};

export async function getCollectionScopeContext(
  request: Request,
): Promise<CollectionScopeContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);

  return {
    userId: tokenCtx?.userId ?? session?.user?.id ?? null,
    activeTeamId: tokenCtx ? null : session?.session?.activeTeamId ?? null,
  };
}
