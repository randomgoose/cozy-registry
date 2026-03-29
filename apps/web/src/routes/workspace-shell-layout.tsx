import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { AppShellLite } from "../components/layout/app-shell-lite";
import { WorkspaceScopeSync } from "../components/workspace/workspace-scope-sync";

function WorkspaceOutletFallback() {
  return (
    <div className="min-h-[min(65vh,520px)] rounded-[28px] border border-zinc-200/80 bg-white/60 p-8 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="h-12 max-w-md animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
      <div className="mt-6 h-32 max-w-lg animate-pulse rounded-2xl bg-zinc-100/90 dark:bg-zinc-800/50" />
    </div>
  );
}

/** Shared authenticated workspace chrome; route-level lazy chunks load inside the right column only. */
export function WorkspaceShellLayout() {
  return (
    <AppShellLite>
      <WorkspaceScopeSync />
      <Suspense fallback={<WorkspaceOutletFallback />}>
        <Outlet />
      </Suspense>
    </AppShellLite>
  );
}
