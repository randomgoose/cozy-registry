import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { parseWorkspacePath } from "../../lib/workspace-path";
import { syncPersonalWorkspaceSession } from "../../lib/workspace-session-sync";

/**
 * When the URL is under personal shell paths, ensure auth session matches (no active org/team).
 * Org URLs are handled by `WorkspaceOrgLayout`; `/t/...` by `TeamScopedPage`.
 */
export function WorkspaceScopeSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    const parsed = parseWorkspacePath(pathname);
    if (!parsed || parsed.mode !== "personal") return;
    void syncPersonalWorkspaceSession().catch((error) => {
      console.error("Failed to sync personal workspace session", error);
    });
  }, [pathname]);

  return null;
}
