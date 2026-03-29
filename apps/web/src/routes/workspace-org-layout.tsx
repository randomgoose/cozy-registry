import { useEffect, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { syncOrgWorkspaceSessionFromSlug } from "../lib/workspace-session-sync";

function OrgScopeLoading() {
  return (
    <div className="flex min-h-[min(65vh,520px)] items-center justify-center rounded-[28px] border border-zinc-200/80 bg-zinc-50/80 px-6 py-16 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading workspace…</p>
    </div>
  );
}

/**
 * Validates `/w/:orgSlug/*` and syncs active org (no team) to match the URL.
 */
export function WorkspaceOrgLayout() {
  const { orgSlug } = useParams();
  const [state, setState] = useState<"loading" | "invalid" | "ready">("loading");

  useEffect(() => {
    setState("loading");
    let cancelled = false;
    const slug = orgSlug ?? "";
    if (!slug) {
      setState("invalid");
      return;
    }
    void (async () => {
      const ok = await syncOrgWorkspaceSessionFromSlug(slug);
      if (cancelled) return;
      setState(ok ? "ready" : "invalid");
    })();
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  if (state === "loading") {
    return <OrgScopeLoading />;
  }
  if (state === "invalid") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
