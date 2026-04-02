import type { ReactNode } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";

import { PersonalScopeSync } from "./PersonalScopeSync";

export const dynamic = "force-dynamic";

export default async function MeLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

  return (
    <>
      <PersonalScopeSync activeOrganizationId={activeOrganizationId} />
      {children}
    </>
  );
}
