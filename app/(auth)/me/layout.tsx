import type { ReactNode } from "react";

import { PersonalScopeSync } from "./PersonalScopeSync";

export const dynamic = "force-dynamic";

export default function MeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PersonalScopeSync />
      {children}
    </>
  );
}
