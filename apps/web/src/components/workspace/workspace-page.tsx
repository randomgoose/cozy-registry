import { useEffect, useMemo, useState } from "react";
import { fetchAuthControlSession, postAuthControl } from "../../lib/auth-control";
import { fetchCurrentWorkspace, type WorkspaceData } from "../../lib/platform";
import { AppShellLite } from "../layout/app-shell-lite";

export function WorkspacePage() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  async function loadWorkspace() {
    setLoading(true);
    try {
      const data = await fetchCurrentWorkspace();
      setWorkspaceData(data);
      setNameDraft(data?.workspace?.name ?? "");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAuthControlSession()
      .then((data) => {
        if (!data?.user?.id) {
          setSessionChecked(true);
          setLoading(false);
          return;
        }

        setSessionChecked(true);
        void loadWorkspace();
      })
      .catch((error) => {
        console.error("Failed to load auth-control session", error);
        setSessionChecked(true);
        setLoading(false);
      });
  }, []);

  const isOwner = workspaceData?.role === "owner";
  const workspace = workspaceData?.workspace ?? null;
  const hasWorkspace = !!workspace;
  const canSaveName =
    !!workspace &&
    !!nameDraft.trim() &&
    nameDraft.trim() !== workspace.name;

  const subtitle = useMemo(() => {
    if (!workspace) {
      return "Choose or create a workspace to manage organization-level settings.";
    }

    return `Workspace-level settings for @${workspace.slug}. Teams remain the scoped spaces where shared registry assets live.`;
  }, [workspace]);

  async function handleUpdateWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace || !canSaveName) return;

    setSaving(true);
    try {
      const { response, data } = await postAuthControl("/organization/update", {
        organizationId: workspace.id,
        data: { name: nameDraft.trim() },
      });

      if (!response.ok) {
        window.alert((data?.message as string | undefined) || "Failed to update workspace");
        return;
      }

      await loadWorkspace();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!workspace) return;

    const confirmation = window.prompt(
      `Type the workspace slug "${workspace.slug}" to delete this workspace.`,
    );

    if (confirmation !== workspace.slug) return;

    setDeleting(true);
    try {
      const { response, data } = await postAuthControl("/organization/delete", {
        organizationId: workspace.id,
      });

      if (!response.ok) {
        window.alert((data?.message as string | undefined) || "Failed to delete workspace");
        return;
      }

      window.location.href = "/dashboard";
    } finally {
      setDeleting(false);
    }
  }

  if (!sessionChecked) {
    return <div className="p-6 text-sm text-zinc-500">Loading...</div>;
  }

  if (!workspaceData && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Sign in to open workspace settings</h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Workspace management is now available in the migrated host, but you still need an active session.
          </p>
          <a
            href="/sign-in?callbackUrl=%2Fworkspace"
            className="mt-6 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Continue to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <AppShellLite
      title={workspace?.name ?? "Workspace"}
      subtitle="Workspace settings are now hosted locally. Organization mutations flow through cozy-platform /auth-control."
      activeNav="workspace"
    >
      <div className="space-y-8">
        <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Workspace
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>

          {loading ? (
            <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
          ) : !hasWorkspace || !workspace || !workspaceData ? (
            <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                No active workspace
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Create or choose a workspace from the scope switcher first. Team pages and collaboration controls are scoped beneath a workspace.
              </p>
            </section>
          ) : (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Workspace slug
                  </div>
                  <div className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    @{workspace.slug}
                  </div>
                </div>
                <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Teams
                  </div>
                  <div className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {workspaceData.teams.length}
                  </div>
                </div>
                <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Members
                  </div>
                  <div className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {workspaceData.members.length}
                  </div>
                </div>
                <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Pending invites
                  </div>
                  <div className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {workspaceData.invitations.length}
                  </div>
                </div>
              </div>

              {isOwner ? (
                <form
                  onSubmit={handleUpdateWorkspace}
                  className="mt-6 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50 sm:flex-row sm:items-end"
                >
                  <label className="flex-1">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      Workspace name
                    </div>
                    <input
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="Acme Design"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!canSaveName || saving}
                    className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    {saving ? "Saving..." : "Save workspace"}
                  </button>
                </form>
              ) : (
                <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
                  Only workspace owners can rename or delete the workspace.
                </p>
              )}
            </>
          )}
        </section>

        {workspaceData && workspace ? (
          <>
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Teams</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Teams are the scoped spaces where shared registry assets, collections, and team publishing live.
                </p>
                {workspaceData.teams.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">No teams yet.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {workspaceData.teams.map((team) => (
                      <li
                        key={team.id}
                        className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40"
                      >
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {team.name}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {team.slug ? `@${workspace.slug}/${team.slug}` : "Slug pending"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Members and invites
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Workspace membership controls the top-level access boundary. Team-specific role adjustments still happen from settings.
                </p>
                <div className="mt-4 text-sm text-zinc-900 dark:text-zinc-100">
                  {workspaceData.members.length} members · {workspaceData.invitations.length} pending invites
                </div>
                <div className="mt-4 space-y-2">
                  {workspaceData.members.slice(0, 5).map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {member.name || member.email}
                        </div>
                        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {member.email}
                        </div>
                      </div>
                      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
                <a
                  href="/settings"
                  className="mt-4 inline-flex text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  Open team settings
                </a>
              </div>
            </section>

            {isOwner ? (
              <section className="rounded-[28px] border border-red-200 bg-red-50/70 p-6 dark:border-red-900/60 dark:bg-red-950/20">
                <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
                  Danger zone
                </h2>
                <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/80">
                  Deleting a workspace removes the organization container and its associated teams.
                </p>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDeleteWorkspace()}
                  className="mt-4 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Delete workspace"}
                </button>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShellLite>
  );
}
