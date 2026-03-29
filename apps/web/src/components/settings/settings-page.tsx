import { useEffect, useState } from "react";
import { ArrowRight, KeyRound, Users } from "lucide-react";
import { fetchApiKeys, postAuthControl } from "../../lib/auth-control";
import {
  cancelProjectInvitation,
  fetchCurrentWorkspace,
  fetchProjectMembers,
  fetchProjects,
  inviteProjectMember,
  type Project,
  type ProjectMembership,
  type WorkspaceData,
  removeProjectMember,
  updateProjectMemberRole,
} from "../../lib/platform";
import { getPlatformBaseUrl } from "../../lib/runtime-config";
import { AppShellLite } from "../layout/app-shell-lite";

export function SettingsPage() {
  const platformBaseUrl = getPlatformBaseUrl();
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectAccess, setSelectedProjectAccess] = useState<ProjectMembership | null>(null);
  const [apiKeys, setApiKeys] = useState<
    Array<{
      id: string;
      name: string | null;
      prefix: string | null;
      start: string | null;
      createdAt: string;
      expiresAt: string | null;
      enabled: boolean;
    }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "signed-out" | "ready" | "error">(
    platformBaseUrl ? "loading" : "error",
  );

  async function loadSettings(signal?: AbortSignal) {
    const [workspaceData, projectData] = await Promise.all([
      fetchCurrentWorkspace(signal),
      fetchProjects(signal),
    ]);

    if (!workspaceData || !projectData) {
      setStatus("signed-out");
      return;
    }

    setWorkspace(workspaceData);
    setProjects(projectData);
    setSelectedProjectId((current) =>
      projectData.some((project) => project.id === current)
        ? current
        : projectData[0]?.id ?? null,
    );
    setStatus("ready");
  }

  async function loadApiKeys(organizationId?: string | null) {
    const data = await fetchApiKeys(organizationId);
    setApiKeys(data?.apiKeys ?? []);
  }

  useEffect(() => {
    const controller = new AbortController();
    if (!platformBaseUrl) {
      return () => controller.abort();
    }

    loadSettings(controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load settings page", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, [platformBaseUrl]);

  useEffect(() => {
    if (status !== "ready" || !workspace) return;

    loadApiKeys(workspace.activeOrganizationId).catch((error) => {
      console.error("Failed to load API keys", error);
    });
  }, [status, workspace]);

  useEffect(() => {
    const controller = new AbortController();

    if (status !== "ready" || !selectedProjectId) {
      setSelectedProjectAccess(null);
      return () => controller.abort();
    }

    fetchProjectMembers(selectedProjectId, controller.signal)
      .then((data) => {
        setSelectedProjectAccess(data);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load selected project access", error);
        setSelectedProjectAccess(null);
      });

    return () => controller.abort();
  }, [selectedProjectId, status]);

  async function refreshCollaboration() {
    await loadSettings();
  }

  async function refreshApiKeys() {
    await loadApiKeys(workspace?.activeOrganizationId ?? null);
  }

  async function handleInviteMember(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProjectAccess || !selectedProjectId || selectedProjectAccess.accessScope.kind !== "team" || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await inviteProjectMember(selectedProjectId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      if (!result.response.ok) {
        setMessage((result.data?.message as string | undefined) ?? (result.data?.error as string | undefined) ?? "Failed to invite member.");
        return;
      }

      setInviteEmail("");
      await refreshCollaboration();
      setMessage("Invitation sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to invite member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    if (!selectedProjectId || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await cancelProjectInvitation(selectedProjectId, invitationId);

      if (!result.response.ok) {
        setMessage(
          (result.data?.message as string | undefined) ??
            (result.data?.error as string | undefined) ??
            "Failed to cancel invitation.",
        );
        return;
      }

      await refreshCollaboration();
      setMessage("Invitation cancelled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to cancel invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedProjectId || busy) return;
    const confirmed = window.confirm("Remove this member from the selected project access group?");
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await removeProjectMember(selectedProjectId, userId);

      if (!result.response.ok) {
        setMessage(
          (result.data?.message as string | undefined) ??
            (result.data?.error as string | undefined) ??
            "Failed to remove member.",
        );
        return;
      }

      await refreshCollaboration();
      setMessage("Member removed from project access.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to remove member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateRole(memberId: string, role: string) {
    if (!selectedProjectId || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await updateProjectMemberRole(selectedProjectId, memberId, role);

      if (!result.response.ok) {
        setMessage(
          (result.data?.message as string | undefined) ??
            (result.data?.error as string | undefined) ??
            "Failed to update role.",
        );
        return;
      }

      await refreshCollaboration();
      setMessage("Member role updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update role.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateApiKey(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage(null);
    setCreatedApiKey(null);
    try {
      const { response, data } = await postAuthControl("/api-key/create", {
        name: newApiKeyName.trim() || undefined,
        organizationId: workspace?.activeOrganizationId ?? undefined,
      });

      const payload = data as {
        key?: string;
        message?: string;
      } | null;

      if (!response.ok || !payload?.key) {
        setMessage(payload?.message ?? "Failed to create API key.");
        return;
      }

      setCreatedApiKey(payload.key);
      setNewApiKeyName("");
      await refreshApiKeys();
      setMessage("API key created. Copy it now; it will not be shown again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create API key.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteApiKey(keyId: string) {
    if (busy) return;
    const confirmed = window.confirm("Delete this API key?");
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const { response, data } = await postAuthControl("/api-key/delete", {
        keyId,
      });

      const payload = data as { message?: string } | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Failed to delete API key.");
        return;
      }

      await refreshApiKeys();
      setMessage("API key deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete API key.");
    } finally {
      setBusy(false);
    }
  }

  const canManageTeam =
    selectedProjectAccess?.members.some(
      (member) =>
        member.role === "owner" || member.role === "admin" || member.role === "editor",
    ) ?? false;
  const canManageSelectedProject =
    selectedProjectAccess?.accessScope.kind === "team" ? canManageTeam : true;

  if (status === "signed-out") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="max-w-md rounded-[28px] border border-zinc-200 bg-white/92 p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Sign in to open settings
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Settings now work from the migrated host, but you still need an active session and a running auth/API bridge.
          </p>
          <div className="mt-6">
            <a
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Continue to sign in
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="max-w-2xl rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          Settings could not reach the extracted platform APIs. Check <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">VITE_COZY_PLATFORM_BASE_URL</code>.
        </div>
      </div>
    );
  }

  return (
    <AppShellLite
      title={workspace?.workspace?.name ?? "Workspace"}
      subtitle="Platform-backed reads and workspace scope switching are available here. Only deeper organization management and token surfaces still fall back to the auth/API bridge."
      activeNav="settings"
    >
      <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Settings overview
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Workspace and project access
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This page now reads workspace, projects, and project access through cozy-platform. Workspace scope switching also stays inside the migrated shell.
            </p>
          </div>

        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            Project access now works directly from the migrated host
          </div>
        </div>
      </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Workspace
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {workspace?.workspace?.name ?? "No workspace"}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Projects
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {projects?.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Teams
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {workspace?.teams.length ?? 0}
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <section className="mt-6 rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 text-sm text-zinc-700 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          {message}
          {createdApiKey ? (
            <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                New API key
              </div>
              <code className="mt-2 block whitespace-pre-wrap break-all text-sm text-zinc-900 dark:text-zinc-100">
                {createdApiKey}
              </code>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            <Users className="size-5" />
            Project access
          </div>
          {selectedProjectAccess ? (
            <>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                Selected project:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {selectedProjectAccess.project.title}
                </span>
              </p>
              {projects && projects.length > 0 ? (
                <select
                  value={selectedProjectId ?? ""}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Access
                  </p>
                  <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {selectedProjectAccess.accessScope.kind === "team"
                      ? `${selectedProjectAccess.accessScope.team?.organizationName ?? "Unknown org"} / ${selectedProjectAccess.accessScope.team?.name ?? "Unknown team"}`
                      : "Personal owner scope"}
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Members
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {selectedProjectAccess.members.length}
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Invitations
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {selectedProjectAccess.invitations.length}
                  </p>
                </div>
              </div>
              {selectedProjectAccess.accessScope.kind === "team" && canManageSelectedProject ? (
                <form
                  onSubmit={handleInviteMember}
                  className="mt-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Invite to project access group
                  </div>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@example.com"
                    className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    type="submit"
                    disabled={busy || !inviteEmail.trim()}
                    className="mt-3 inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    Send invitation
                  </button>
                </form>
              ) : null}

              {selectedProjectAccess.members.length > 0 ? (
                <div className="mt-5 space-y-3">
                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Project members
                  </div>
                  {selectedProjectAccess.members.map((member) => (
                    <div
                      key={member.memberId}
                      className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-zinc-950 dark:text-zinc-50">
                            {member.name || member.email}
                          </div>
                          <div className="text-sm text-zinc-500 dark:text-zinc-400">
                            {member.email}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={member.role}
                            disabled={!canManageSelectedProject || busy || selectedProjectAccess.accessScope.kind !== "team"}
                            onChange={(event) =>
                              void handleUpdateRole(member.memberId, event.target.value)
                            }
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                          </select>
                          {selectedProjectAccess.accessScope.kind === "team" && canManageSelectedProject ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRemoveMember(member.id)}
                              className="rounded-full border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {selectedProjectAccess.invitations.length > 0 ? (
                <div className="mt-5 space-y-3">
                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Pending invitations
                  </div>
                  {selectedProjectAccess.invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
                    >
                      <div>
                        <div className="font-medium text-zinc-950 dark:text-zinc-50">
                          {invitation.email}
                        </div>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          {invitation.role} · pending
                        </div>
                      </div>
                      {selectedProjectAccess.accessScope.kind === "team" && canManageSelectedProject ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleCancelInvitation(invitation.id)}
                          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              No project access data yet. Project access controls will appear here when a project is available in the current workspace scope.
            </p>
          )}
        </div>

        <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            <KeyRound className="size-5" />
            API keys
          </div>
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Policy reads and writes already live behind extracted platform endpoints, and key inventory now runs inside the migrated host through the auth API bridge.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Projects available for policy scoping: {projects?.length ?? 0}</li>
            <li>Active workspace members: {workspace?.members.length ?? 0}</li>
            <li>Pending invitations: {workspace?.invitations.length ?? 0}</li>
          </ul>
          <form onSubmit={handleCreateApiKey} className="mt-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Create API key
            </div>
            <input
              value={newApiKeyName}
              onChange={(event) => setNewApiKeyName(event.target.value)}
              placeholder="CI deploy key"
              className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Create key
              <ArrowRight className="size-4" />
            </button>
          </form>

          <div className="mt-5 space-y-3">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Existing keys
            </div>
            {apiKeys.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No API keys yet.
              </p>
            ) : (
              apiKeys.map((apiKey) => (
                <div
                  key={apiKey.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <div>
                    <div className="font-medium text-zinc-950 dark:text-zinc-50">
                      {apiKey.name || "Unnamed key"}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {[apiKey.prefix, apiKey.start].filter(Boolean).join("") || apiKey.id}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Created {new Date(apiKey.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeleteApiKey(apiKey.id)}
                    className="rounded-full border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </AppShellLite>
  );
}
