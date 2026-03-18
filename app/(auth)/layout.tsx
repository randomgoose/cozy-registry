import type { ReactNode } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { AppShell } from "./AppShell";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email ?? null;

  return <AppShell email={email}>{children}</AppShell>;
}

