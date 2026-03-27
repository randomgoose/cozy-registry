"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type WorkspaceData = {
  activeOrganizationId: string | null;
  role: string | null;
  workspace: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    logo?: string | null;
  } | null;
  teams: Array<{
    id: string;
    name: string;
    slug: string | null;
    createdAt: string;
  }>;
  members: Array<{
    memberId: string;
    id: string;
    name: string | null;
    email: string;
    role: string;
    image?: string | null;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    teamId: string | null;
    teamName: string | null;
    createdAt: string;
    expiresAt: string;
  }>;
};

export default function WorkspacePage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  async function loadWorkspace() {
    setLoading(true);
    try {
      const response = await fetch("/api/workspace/current", { cache: "no-store" });
      const data = (await response.json()) as WorkspaceData;
      setWorkspaceData(data);
      setNameDraft(data.workspace?.name ?? "");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (!data?.user?.id) {
        setSessionChecked(true);
        setLoading(false);
        return;
      }

      setSessionChecked(true);
      void loadWorkspace();
    });
  }, []);

  const isOwner = workspaceData?.role === "owner";
  const hasWorkspace = !!workspaceData?.workspace;
  const workspace = workspaceData?.workspace ?? null;
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

  async function handleUpdateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !canSaveName) return;

    setSaving(true);
    try {
      const response = await fetch("/api/auth/organization/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId: workspace.id,
          data: {
            name: nameDraft.trim(),
          },
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        alert(message || "Failed to update workspace");
        return;
      }

      await loadWorkspace();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!workspace) return;

    const confirmation = window.prompt(
      `Type the workspace slug "${workspace.slug}" to delete this workspace.`,
    );

    if (confirmation !== workspace.slug) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("/api/auth/organization/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId: workspace.id,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        alert(message || "Failed to delete workspace");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  if (!sessionChecked) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
  }

  if (loading) {
    return (
      <>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Workspace
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {subtitle}
        </p>
        <p className="mt-6 text-sm text-zinc-500">Loading...</p>
      </>
    );
  }

  if (!workspaceData || !hasWorkspace || !workspace) {
    return (
      <>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Workspace
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {subtitle}
        </p>
        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            No active workspace
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Create or choose a workspace from the scope switcher first. Team pages
            and collaboration controls are scoped beneath a workspace.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Workspace
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {subtitle}
      </p>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Workspace details
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Top-level organization details and destructive actions live here.
              Team-specific collaboration stays in{" "}
              <Link
                href="/settings"
                className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
              >
                Settings
              </Link>
              .
            </p>
          </div>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Role: {workspaceData.role ?? "viewer"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            className="mt-6 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50 sm:flex-row sm:items-end"
          >
            <label className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Workspace name
              </div>
              <Input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                className="mt-2"
                placeholder="Acme Design"
              />
            </label>
            <Button type="submit" disabled={!canSaveName || saving}>
              {saving ? "Saving..." : "Save workspace"}
            </Button>
          </form>
        ) : (
          <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
            Only workspace owners can rename or delete the workspace.
          </p>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Teams
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Teams are the scoped spaces where shared registry assets,
            collections, and team publishing live.
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

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Members and invites
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Workspace membership controls the top-level access boundary.
            Team-specific role adjustments still happen from the active team
            settings page.
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

          <Link
            href="/settings"
            className="mt-4 inline-flex text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            Open team settings
          </Link>
        </div>
      </section>

      {isOwner ? (
        <section className="mt-8 rounded-xl border border-red-200 bg-red-50/70 p-6 dark:border-red-900/60 dark:bg-red-950/20">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
            Danger zone
          </h2>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/80">
            Deleting a workspace removes the organization container and its
            associated teams. This should live here rather than inside the
            scope switcher so it stays explicit and reviewable.
          </p>
          <div className="mt-4">
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDeleteWorkspace()}
            >
              {deleting ? "Deleting..." : "Delete workspace"}
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
