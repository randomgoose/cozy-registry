"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  organizationId: string;
  activeOrganizationId: string | null;
};

export function WorkspaceScopeSync({ organizationId, activeOrganizationId }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (activeOrganizationId === organizationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/organization/set-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ organizationId }),
        });
        if (!cancelled && res.ok) router.refresh();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId, organizationId, router]);

  return null;
}
