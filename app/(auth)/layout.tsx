import type { ReactNode } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getWorkspaceContextForSession } from "@/lib/workspace-context";
import { AppShell } from "./AppShell";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email ?? null;
  const fullName =
    session?.user?.name?.trim() ||
    session?.user?.email?.split("@")[0] ||
    "Dashboard";
  let username = session?.user?.email?.split("@")[0] || fullName;

  if (session?.user?.id) {
    const [row] = await db
      .select({ handle: user.handle })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);
    username = row?.handle ?? username;
  }

  const workspace = await getWorkspaceContextForSession(session);

  return (
    <AppShell
      email={email}
      fullName={fullName}
      username={username}
      workspace={workspace}
    >
      {children}
    </AppShell>
  );
}
