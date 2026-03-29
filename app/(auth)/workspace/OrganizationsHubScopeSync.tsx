"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Clears active org when viewing the organizations directory (/workspace). */
export function OrganizationsHubScopeSync() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/organization/set-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ organizationId: null }),
        });
        if (res.ok) router.refresh();
      } catch {
        /* ignore */
      }
    })();
  }, [router]);

  return null;
}
