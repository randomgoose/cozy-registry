import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  parseWorkspacePath,
  shellHrefsFromParsed,
  type ParsedWorkspacePath,
  type WorkspaceShellHrefs,
} from "../lib/workspace-path";

const DEFAULT_PARSED: ParsedWorkspacePath = {
  mode: "personal",
  section: "dashboard",
};

export function useWorkspaceShellRouting(): {
  pathname: string;
  parsed: ParsedWorkspacePath;
  hrefs: WorkspaceShellHrefs;
  /** True when current URL is a recognized shell path (should always be true inside shell). */
  isShellPath: boolean;
} {
  const { pathname } = useLocation();
  return useMemo(() => {
    const parsed = parseWorkspacePath(pathname);
    const isShellPath = parsed !== null;
    const effective = parsed ?? DEFAULT_PARSED;
    return {
      pathname,
      parsed: effective,
      hrefs: shellHrefsFromParsed(effective),
      isShellPath,
    };
  }, [pathname]);
}
