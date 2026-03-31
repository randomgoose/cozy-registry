import type { ReactNode } from "react";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getWorkspaceContextForUser } from "@/lib/workspace-context";
import { AppShell } from "./AppShell";

export const dynamic = "force-dynamic";

const getCachedUserHandle = unstable_cache(
  async (userId: string) => {
    const [row] = await db
      .select({ handle: user.handle })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row?.handle ?? null;
  },
  ["auth-layout-user-handle"],
  { revalidate: 10 },
);

const getCachedWorkspaceContext = unstable_cache(
  async (userId: string, activeOrganizationId: string | null) =>
    getWorkspaceContextForUser(userId, activeOrganizationId),
  ["auth-layout-workspace-context"],
  { revalidate: 10 },
);

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email ?? null;
  const fullName =
    session?.user?.name?.trim() ||
    session?.user?.email?.split("@")[0] ||
    "Dashboard";
  let username = session?.user?.email?.split("@")[0] || fullName;

  const userId = session?.user?.id ?? null;
  const activeOrganizationId = session?.session?.activeOrganizationId ?? null;
  const [cachedHandle, workspace] = userId
    ? await Promise.all([
        getCachedUserHandle(userId),
        getCachedWorkspaceContext(userId, activeOrganizationId),
      ])
    : [null, { organizations: [], activeOrganizationId: null, activeOrganization: null }];

  username = cachedHandle ?? username;

  return (
    <AppShell
      userId={userId}
      email={email}
      fullName={fullName}
      username={username}
      workspace={workspace}
    >
      {children}
    </AppShell>
  );
}
