/**
 * Workspace shell routing: URL is the source of truth for personal vs org vs team scope.
 *
 * - Personal: `/dashboard`, `/projects`, `/projects/:slug`, `/settings`, `/notifications` (`/workspace` redirects to `/dashboard`)
 * - Organization: `/w/:orgSlug/<same segments>`
 * - Team (access group): `/t/:orgSlug/:teamSlug/<same segments>`
 */

export type ShellSection =
  | "dashboard"
  | "projects"
  | "settings"
  | "workspace"
  | "notifications";

export type ParsedWorkspacePath =
  | {
      mode: "personal";
      section: ShellSection;
      projectSlug?: string;
    }
  | {
      mode: "org";
      orgSlug: string;
      section: ShellSection;
      projectSlug?: string;
    }
  | {
      mode: "team";
      orgSlug: string;
      teamSlug: string;
      section: ShellSection;
      projectSlug?: string;
    };

function matchSection(
  parts: string[],
  startIndex: number,
): { section: ShellSection; projectSlug?: string; consumed: number } | null {
  const head = parts[startIndex];
  if (!head) return null;
  if (head === "dashboard") return { section: "dashboard", consumed: 1 };
  if (head === "settings") return { section: "settings", consumed: 1 };
  if (head === "workspace") return { section: "workspace", consumed: 1 };
  if (head === "notifications") return { section: "notifications", consumed: 1 };
  if (head === "projects") {
    const next = parts[startIndex + 1];
    if (next) {
      return { section: "projects", projectSlug: decodeURIComponent(next), consumed: 2 };
    }
    return { section: "projects", consumed: 1 };
  }
  return null;
}

/** Returns null if pathname is not a known workspace-shell path. */
export function parseWorkspacePath(pathname: string): ParsedWorkspacePath | null {
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "t" && parts.length >= 4) {
    const orgSlug = decodeURIComponent(parts[1] ?? "");
    const teamSlug = decodeURIComponent(parts[2] ?? "");
    const matched = matchSection(parts, 3);
    if (!matched) return null;
    return {
      mode: "team",
      orgSlug,
      teamSlug,
      section: matched.section,
      projectSlug: matched.projectSlug,
    };
  }

  if (parts[0] === "w" && parts.length >= 3) {
    const orgSlug = decodeURIComponent(parts[1] ?? "");
    const matched = matchSection(parts, 2);
    if (!matched) return null;
    return {
      mode: "org",
      orgSlug,
      section: matched.section,
      projectSlug: matched.projectSlug,
    };
  }

  const matched = matchSection(parts, 0);
  if (!matched) return null;
  return {
    mode: "personal",
    section: matched.section,
    projectSlug: matched.projectSlug,
  };
}

function baseForSection(
  parsed: ParsedWorkspacePath,
  section: ShellSection,
  projectSlug?: string,
): ParsedWorkspacePath {
  if (parsed.mode === "personal") {
    return { mode: "personal", section, projectSlug };
  }
  if (parsed.mode === "org") {
    return { mode: "org", orgSlug: parsed.orgSlug, section, projectSlug };
  }
  return {
    mode: "team",
    orgSlug: parsed.orgSlug,
    teamSlug: parsed.teamSlug,
    section,
    projectSlug,
  };
}

export function buildWorkspacePath(target: ParsedWorkspacePath): string {
  const suffix =
    target.section === "projects" && target.projectSlug
      ? `projects/${encodeURIComponent(target.projectSlug)}`
      : target.section;
  if (target.mode === "personal") {
    return `/${suffix}`;
  }
  if (target.mode === "org") {
    return `/w/${encodeURIComponent(target.orgSlug)}/${suffix}`;
  }
  return `/t/${encodeURIComponent(target.orgSlug)}/${encodeURIComponent(target.teamSlug)}/${suffix}`;
}

/** Keep current section (and project slug) but switch scope. */
export function rehomeWorkspacePath(
  current: ParsedWorkspacePath,
  next:
    | { mode: "personal" }
    | { mode: "org"; orgSlug: string }
    | { mode: "team"; orgSlug: string; teamSlug: string },
): string {
  const { section, projectSlug } = current;
  if (next.mode === "personal") {
    return buildWorkspacePath({ mode: "personal", section, projectSlug });
  }
  if (next.mode === "org") {
    return buildWorkspacePath({
      mode: "org",
      orgSlug: next.orgSlug,
      section,
      projectSlug,
    });
  }
  return buildWorkspacePath({
    mode: "team",
    orgSlug: next.orgSlug,
    teamSlug: next.teamSlug,
    section,
    projectSlug,
  });
}

export type WorkspaceShellHrefs = {
  dashboard: string;
  projects: string;
  settings: string;
  workspace: string;
  notifications: string;
  projectDetail: (slug: string) => string;
};

export function shellHrefsFromParsed(parsed: ParsedWorkspacePath): WorkspaceShellHrefs {
  return {
    dashboard: buildWorkspacePath(baseForSection(parsed, "dashboard")),
    projects: buildWorkspacePath(baseForSection(parsed, "projects")),
    settings: buildWorkspacePath(baseForSection(parsed, "settings")),
    workspace: buildWorkspacePath(baseForSection(parsed, "workspace")),
    notifications: buildWorkspacePath(baseForSection(parsed, "notifications")),
    projectDetail: (slug: string) =>
      buildWorkspacePath(baseForSection(parsed, "projects", slug)),
  };
}
