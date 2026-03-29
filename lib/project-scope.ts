import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-api";

export type ProjectScopeContext = {
  userId: string | null;
  activeOrganizationId: string | null;
};

export async function getProjectScopeContext(request: Request): Promise<ProjectScopeContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);

  return {
    userId: tokenCtx?.userId ?? session?.user?.id ?? null,
    activeOrganizationId: tokenCtx ? null : session?.session?.activeOrganizationId ?? null,
  };
}
