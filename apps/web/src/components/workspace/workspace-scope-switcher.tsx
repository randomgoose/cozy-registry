import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Plus } from "lucide-react";
import { fetchWorkspaceScopeContext, postAuthControl } from "../../lib/auth-control";

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

export function WorkspaceScopeSwitcher() {
  const [context, setContext] = useState<WorkspaceScopeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
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
  }, []);

  const activePrimaryLabel = useMemo(() => {
    if (!context) return "Workspace";
    return context.workspace.activeTeam?.name ?? "Personal";
  }, [context]);

  const activeSecondaryLabel = useMemo(() => {
    if (!context) return "Loading scope";

    if (context.workspace.activeTeam && context.workspace.activeOrganization) {
      return context.workspace.activeOrganization.name;
    }

    return "Your own registry";
  }, [context]);

  const targetOrganization = context?.workspace.activeOrganization ?? context?.workspace.organizations[0] ?? null;

  async function switchToPersonal() {
    try {
      setPending(true);
      setError(null);
      await postAuthControl("/organization/set-active-team", { teamId: null });
      await postAuthControl("/organization/set-active", { organizationId: null });
      window.location.assign("/dashboard");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to switch scope");
    } finally {
      setPending(false);
      setMenuOpen(false);
    }
  }

  async function switchToTeam(organizationId: string, teamId: string) {
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

  async function createScope() {
    const nextName = createName.trim();
    if (!nextName) return;

    try {
      setPending(true);
      setError(null);

      if (!targetOrganization) {
        const slug = slugifyWorkspaceName(nextName);
        if (!slug) {
          throw new Error("Please enter a valid workspace name.");
        }

        const { response, data } = await postAuthControl("/organization/create", {
          name: nextName,
          slug,
        });

        if (!response.ok) {
          throw new Error((data?.message as string | undefined) || `Request failed (${response.status})`);
        }

        window.location.assign("/workspace");
        return;
      }

      const { response, data } = await postAuthControl("/organization/create-team", {
        name: nextName,
        organizationId: targetOrganization.id,
      });

      if (!response.ok) {
        throw new Error((data?.message as string | undefined) || `Request failed (${response.status})`);
      }

      const created = data as { id?: string } | null;
      if (!created?.id) {
        throw new Error("Team created, but no team id was returned.");
      }

      await postAuthControl("/organization/add-team-member", {
        teamId: created.id,
        userId: context?.userId ?? null,
      });
      await postAuthControl("/team/ensure-slug", {
        teamId: created.id,
      });
      await postAuthControl("/organization/set-active", {
        organizationId: targetOrganization.id,
      });
      await postAuthControl("/organization/set-active-team", {
        teamId: created.id,
      });

      window.location.assign("/dashboard");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create scope");
    } finally {
      setPending(false);
      setCreateOpen(false);
      setCreateName("");
      setMenuOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/90 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        <LoaderCircle className="size-4 animate-spin" />
        Loading scope
      </div>
    );
  }

  if (!context) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        className="inline-flex items-center gap-3 rounded-full border border-zinc-300 bg-white/95 px-3 py-2 text-left text-sm text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
      >
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Scope
          </div>
          <div className="truncate font-medium">{activePrimaryLabel}</div>
          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {activeSecondaryLabel}
          </div>
        </div>
        <ChevronDown className="size-4 shrink-0" />
      </button>

      {menuOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-[320px] rounded-3xl border border-zinc-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.14)] dark:border-zinc-800 dark:bg-zinc-950">
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-3 ring-1 ring-zinc-200/80 dark:bg-zinc-900/70 dark:ring-zinc-800">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Active scope
            </div>
            <div className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {activePrimaryLabel}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeSecondaryLabel}
            </div>
          </div>

          <div className="mt-3 space-y-1">
            <button
              type="button"
              onClick={() => void switchToPersonal()}
              disabled={pending}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-zinc-900/80"
            >
              <div>
                <div className="font-medium">Personal</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Your own registry scope
                </div>
              </div>
              {!context.workspace.activeTeam ? <Check className="size-4" /> : null}
            </button>

            {context.workspace.organizations.map((organization) => (
              <div key={organization.id} className="rounded-2xl border border-zinc-200/80 p-2 dark:border-zinc-800">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  {organization.name}
                </div>
                <div className="space-y-1">
                  {organization.teams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      disabled={pending}
                      onClick={() => void switchToTeam(organization.id, team.id)}
                      className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-zinc-900/80"
                    >
                      <div>
                        <div className="font-medium">{team.name}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          /t/{organization.slug}/{team.slug ?? "pending"}
                        </div>
                      </div>
                      {team.isActive ? <Check className="size-4" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setCreateOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Plus className="size-4" />
              {targetOrganization ? "Create team" : "Create workspace"}
            </button>
            {pending ? (
              <span className="inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <LoaderCircle className="size-4 animate-spin" />
                Updating…
              </span>
            ) : null}
          </div>

          {createOpen ? (
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                {targetOrganization ? "Team name" : "Workspace name"}
              </label>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={targetOrganization ? "Design Systems" : "Acme Design"}
                className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-full px-3 py-2 text-sm text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || !createName.trim()}
                  onClick={() => void createScope()}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {pending ? "Creating…" : targetOrganization ? "Create team" : "Create workspace"}
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
