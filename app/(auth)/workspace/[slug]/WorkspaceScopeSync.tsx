"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = { organizationId: string };

export function WorkspaceScopeSync({ organizationId }: Props) {
  const router = useRouter();

  useEffect(() => {
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
  }, [organizationId, router]);

  return null;
}
