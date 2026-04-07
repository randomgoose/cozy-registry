import type { ReactNode } from "react";
import { getCachedAuthSession } from "@/lib/auth-session";

import { PersonalScopeSync } from "./PersonalScopeSync";

export const dynamic = "force-dynamic";

export default async function MeLayout({ children }: { children: ReactNode }) {
  const session = await getCachedAuthSession();
  const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

  return (
    <>
      <PersonalScopeSync activeOrganizationId={activeOrganizationId} />
      {children}
    </>
  );
}
