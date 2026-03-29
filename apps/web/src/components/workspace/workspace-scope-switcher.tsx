import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Plus } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useWorkspaceShellRouting } from "../../hooks/use-workspace-shell-routing";
import { fetchWorkspaceScopeContext, postAuthControl } from "../../lib/auth-control";
import { rehomeWorkspacePath } from "../../lib/workspace-path";

type ScopeTeam = {
  id: string;
  name: string;
  slug: string | null;
  organizationId: string;
  isActive: boolean;
};

type ScopeOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  teams: ScopeTeam[];
  isActive: boolean;
};

type WorkspaceScopeContext = {
  userId: string;
  workspace: {
    organizations: ScopeOrganization[];
    activeOrganizationId: string | null;
    activeTeamId: string | null;
    activeOrganization: ScopeOrganization | null;
    activeTeam: ScopeTeam | null;
  };
};

function slugifyWorkspaceName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

type WorkspaceScopeSwitcherProps = {
  placement?: "header" | "sidebar";
};

export function WorkspaceScopeSwitcher({ placement = "header" }: WorkspaceScopeSwitcherProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { parsed, hrefs } = useWorkspaceShellRouting();
  const [context, setContext] = useState<WorkspaceScopeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadContext() {
    setLoading(true);
    try {
      const nextContext = await fetchWorkspaceScopeContext();
      if (!nextContext) {
        setContext(null);
        return;
      }
      setContext(nextContext as WorkspaceScopeContext);
    } catch (nextError) {
      console.error("Failed to load workspace scope context", nextError);
      setContext(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContext();
  }, [pathname]);

  const primaryLabel = useMemo(() => {
    if (!context) return "Workspace";
    if (parsed.mode === "personal") return "Personal";
    if (parsed.mode === "org") {
      const org = context.workspace.organizations.find((o) => o.slug === parsed.orgSlug);
      return org?.name ?? parsed.orgSlug;
    }
    const org = context.workspace.organizations.find((o) => o.slug === parsed.orgSlug);
    const team = org?.teams.find((t) => t.slug === parsed.teamSlug);
    return team?.name ?? parsed.teamSlug;
  }, [context, parsed]);

  const hasOrganizations = (context?.workspace.organizations.length ?? 0) > 0;

  const orgWorkspaceSettingsHref = useMemo(() => {
    if (!hasOrganizations) return null;
    if (parsed.mode === "org") return hrefs.workspace;
    if (parsed.mode === "team") {
      return `/w/${encodeURIComponent(parsed.orgSlug)}/workspace`;
    }
    return null;
  }, [hasOrganizations, hrefs.workspace, parsed]);

  async function activateTeamWithoutUrl(organizationId: string, teamId: string) {
    try {
      setPending(true);
      setError(null);
      await postAuthControl("/organization/set-active", { organizationId });
      await postAuthControl("/organization/set-active-team", { teamId });
      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to switch scope");
    } finally {
      setPending(false);
      setMenuOpen(false);
    }
  }

  async function createFirstWorkspace() {
    const name = workspaceNameDraft.trim();
    if (!name) return;

    const slug = slugifyWorkspaceName(name);
    if (!slug) {
      setError("Please enter a valid workspace name.");
      return;
    }

    try {
      setPending(true);
      setError(null);

      const { response, data } = await postAuthControl("/organization/create", {
        name,
        slug,
      });

      if (!response.ok) {
        throw new Error((data?.message as string | undefined) || `Request failed (${response.status})`);
      }

      navigate(`/w/${encodeURIComponent(slug)}/workspace`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create workspace");
    } finally {
      setPending(false);
      setCreateWorkspaceOpen(false);
      setWorkspaceNameDraft("");
      setMenuOpen(false);
    }
  }

  const isSidebar = placement === "sidebar";

  if (loading) {
    return (
      <div
        className={
          isSidebar
            ? "flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300"
            : "inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/90 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        }
      >
        <LoaderCircle className="size-4 animate-spin" />
        Loading scope
      </div>
    );
  }

  if (!context) {
    return null;
  }

  const personalActive = parsed.mode === "personal";
  const personalHref = rehomeWorkspacePath(parsed, { mode: "personal" });

  return (
    <div className={isSidebar ? "relative w-full" : "relative"}>
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        className="flex w-full items-center gap-3 bg-white/90 px-2 py-2 text-left text-sm text-zinc-700 transition hover:bg-white dark:bg-zinc-950/40 dark:text-zinc-200 dark:hover:bg-zinc-900/80"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{primaryLabel}</div>
        </div>
        <ChevronDown className="size-4 shrink-0" />
      </button>

      {menuOpen ? (
        <div
          className={
            isSidebar
              ? "absolute left-0 z-30 mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-3xl border border-zinc-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.14)] dark:border-zinc-800 dark:bg-zinc-950 sm:w-[min(22rem,calc(100vw-3rem))]"
              : "absolute right-0 z-30 mt-2 w-[320px] rounded-3xl border border-zinc-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.14)] dark:border-zinc-800 dark:bg-zinc-950"
          }
        >
      

          <div className="mt-3 space-y-1">
            <Link
              to={personalHref}
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900/80"
            >
              <div>
                <div className="font-medium">Personal</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  /dashboard, /projects, …
                </div>
              </div>
              {personalActive ? <Check className="size-4" /> : null}
            </Link>

            {context.workspace.organizations.map((organization) => (
              <div key={organization.id} className="rounded-2xl border border-zinc-200/80 p-2 dark:border-zinc-800">
                {organization.teams.length === 0 ? (
                  <Link
                    to={rehomeWorkspacePath(parsed, { mode: "org", orgSlug: organization.slug })}
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900/80"
                  >
                    <div>
                      <div className="font-medium text-zinc-950 dark:text-zinc-50">{organization.name}</div>
                      <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        /w/{organization.slug}/… · no access groups yet
                      </div>
                    </div>
                    {parsed.mode === "org" && parsed.orgSlug === organization.slug ? (
                      <Check className="size-4 shrink-0" />
                    ) : null}
                  </Link>
                ) : (
                  <>
                    <Link
                      to={rehomeWorkspacePath(parsed, { mode: "org", orgSlug: organization.slug })}
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center justify-between rounded-2xl px-2 py-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/80"
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                        {organization.name}
                      </div>
                      {parsed.mode === "org" && parsed.orgSlug === organization.slug ? (
                        <Check className="size-4 shrink-0 text-zinc-600 dark:text-zinc-300" />
                      ) : null}
                    </Link>
                    <div className="space-y-1">
                      {organization.teams.map((team) =>
                        team.slug ? (
                          <Link
                            key={team.id}
                            to={rehomeWorkspacePath(parsed, {
                              mode: "team",
                              orgSlug: organization.slug,
                              teamSlug: team.slug,
                            })}
                            onClick={() => setMenuOpen(false)}
                            className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900/80"
                          >
                            <div>
                              <div className="font-medium">{team.name}</div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                /t/{organization.slug}/{team.slug}
                              </div>
                            </div>
                            {parsed.mode === "team" &&
                            parsed.orgSlug === organization.slug &&
                            parsed.teamSlug === team.slug ? (
                              <Check className="size-4" />
                            ) : null}
                          </Link>
                        ) : (
                          <button
                            key={team.id}
                            type="button"
                            disabled={pending}
                            onClick={() => void activateTeamWithoutUrl(organization.id, team.id)}
                            className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-zinc-900/80"
                          >
                            <div>
                              <div className="font-medium">{team.name}</div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                Slug pending — tap to activate
                              </div>
                            </div>
                            {team.isActive ? <Check className="size-4" /> : null}
                          </button>
                        ),
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {orgWorkspaceSettingsHref ? (
              <Link
                to={orgWorkspaceSettingsHref}
                onClick={() => setMenuOpen(false)}
                className="text-center text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Workspace settings
              </Link>
            ) : null}
            {!hasOrganizations ? (
              <button
                type="button"
                onClick={() => setCreateWorkspaceOpen((value) => !value)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Plus className="size-4" />
                Create workspace
              </button>
            ) : null}
            {pending ? (
              <span className="inline-flex items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <LoaderCircle className="size-4 animate-spin" />
                Updating…
              </span>
            ) : null}
          </div>

          {!hasOrganizations && createWorkspaceOpen ? (
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Workspace name
              </label>
              <input
                value={workspaceNameDraft}
                onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                placeholder="Acme Design"
                className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateWorkspaceOpen(false)}
                  className="rounded-full px-3 py-2 text-sm text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || !workspaceNameDraft.trim()}
                  onClick={() => void createFirstWorkspace()}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {pending ? "Creating…" : "Create workspace"}
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
