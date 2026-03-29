"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Clears active organization in the browser session so /api/* matches /me/* routes. */
export function PersonalScopeSync() {
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
