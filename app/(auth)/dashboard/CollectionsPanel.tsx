"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ItemSummary = {
  id: string;
  name: string;
  title: string;
  type: string;
};

type Project = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  itemCount?: number;
};

type ProjectItemRow = {
  itemId: string;
  name: string;
  title: string;
  type: string;
  visibility: string;
  addedAt: string;
};

type CreatedProject = { id: string; slug: string; title: string };

type MemberRow = { userId: string; role: string; name: string | null; email: string };

export function ProjectsPanel(props: {
  items: ItemSummary[];
  className?: string;
  scopeLabel?: string;
  isOrgScope?: boolean;
  /** e.g. `/me/projects` or `/workspace/acme/projects` — enables double-click to open project URL */
  projectsBasePath?: string;
  /** When set (project detail route), pre-select project and show back link */
  initialProjectId?: string | null;
  /** From server on detail route — immediate title / meta before client project list loads */
  initialProjectTitle?: string;
  initialProjectSlug?: string;
  initialProjectVisibility?: "public" | "private";
}) {
  const router = useRouter();
  const isProjectDetail = Boolean(props.initialProjectId);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [newTitle, setNewTitle] = useState("");
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor" | "admin">("viewer");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [step2Members, setStep2Members] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(() => props.initialProjectId ?? null);
  const [projectItems, setProjectItems] = useState<ProjectItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [addItemId, setAddItemId] = useState<string>("");
  const [shareOpen, setShareOpen] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const detailTitle =
    props.initialProjectTitle ??
    selectedProject?.title ??
    (isProjectDetail ? "Project" : "");
  const detailSlug = props.initialProjectSlug ?? selectedProject?.slug ?? "";
  const detailVisibility =
    props.initialProjectVisibility ?? selectedProject?.visibility ?? "private";

  const availableToAdd = useMemo(() => {
    const existing = new Set(projectItems.map((x) => x.itemId));
    return props.items.filter((i) => !existing.has(i.id));
  }, [projectItems, props.items]);

  async function refreshProjects() {
    const res = await fetch("/api/projects", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load projects");
    const data = (await res.json()) as { projects: Project[] };
    setProjects(data.projects ?? []);
  }

  async function refreshSelectedItems(id: string) {
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/items`, { cache: "no-store" });
      const data = (await res.json()) as { items: ProjectItemRow[] };
      setProjectItems(data.items ?? []);
    } finally {
      setItemsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshProjects();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    refreshSelectedItems(selectedId).catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    if (props.initialProjectId) {
      setSelectedId(props.initialProjectId);
    }
  }, [props.initialProjectId]);

  async function loadStep2Members(projectId: string) {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { members?: MemberRow[] } | null;
      setStep2Members(data?.members ?? []);
    } catch {
      setStep2Members([]);
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    if (shareOpen && selectedId) {
      void loadStep2Members(selectedId);
    }
  }, [shareOpen, selectedId]);

  async function submitStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          visibility: "private",
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? "Failed to create project");
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        project?: { id: string; slug: string; title: string };
      } | null;
      const p = data?.project;
      if (!p) {
        alert("Invalid response from server");
        return;
      }
      setCreatedProject({ id: p.id, slug: p.slug, title: p.title });
      setCreateStep(2);
      setInviteInput("");
      setInviteError(null);
      await refreshProjects();
      void loadStep2Members(p.id);
    } finally {
      setCreating(false);
    }
  }

  async function submitShareInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !inviteInput.trim()) return;
    if (!props.isOrgScope) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/projects/${selectedId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrHandle: inviteInput.trim(),
          role: inviteRole,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setInviteError(err?.error ?? "Failed to invite");
        return;
      }
      setInviteInput("");
      await loadStep2Members(selectedId);
    } finally {
      setInviting(false);
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!createdProject || !inviteInput.trim()) return;
    if (!props.isOrgScope) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/projects/${createdProject.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrHandle: inviteInput.trim(),
          role: inviteRole,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setInviteError(err?.error ?? "Failed to invite");
        return;
      }
      setInviteInput("");
      await loadStep2Members(createdProject.id);
    } finally {
      setInviting(false);
    }
  }

  function resetCreateWizard() {
    setCreateStep(1);
    setNewTitle("");
    setCreatedProject(null);
    setInviteInput("");
    setInviteError(null);
    setStep2Members([]);
    setInviteRole("viewer");
    setCreating(false);
  }

  function closeCreateDialog() {
    resetCreateWizard();
    setCreateOpen(false);
  }

  async function addItem() {
    if (!selectedId || !addItemId) return;
    const res = await fetch(`/api/projects/${selectedId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: addItemId }),
    });
    if (!res.ok) {
      alert("Failed to add item");
      return;
    }
    setAddItemId("");
    await refreshProjects();
    await refreshSelectedItems(selectedId);
  }

  async function removeItem(itemId: string) {
    if (!selectedId) return;
    const res = await fetch(`/api/projects/${selectedId}/items/${itemId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Failed to remove item");
      return;
    }
    await refreshProjects();
    await refreshSelectedItems(selectedId);
  }

  return (
    <section className={props.className ?? ""}>
      {isProjectDetail ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {props.projectsBasePath ? (
              <Link
                href={props.projectsBasePath}
                className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                ← All projects
              </Link>
            ) : null}
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {detailTitle}
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {detailSlug ? (
                <>
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                    {detailSlug}
                  </code>
                  <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
                </>
              ) : null}
              {detailVisibility === "private" ? "Private" : "Public"}
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
              {props.scopeLabel ?? "Personal"}
            </p>
          </div>
          {props.isOrgScope ? (
            <Dialog
              open={shareOpen}
              onOpenChange={(open) => {
                setShareOpen(open);
                if (!open) {
                  setInviteInput("");
                  setInviteError(null);
                }
              }}
            >
              <DialogTrigger
                render={
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  />
                }
              >
                Share
              </DialogTrigger>
              <DialogContent className="max-w-md gap-5 px-5 pt-5 pb-5 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite to project</DialogTitle>
                  <DialogDescription>
                    Invite organization members by email or @handle. They must already belong to this
                    organization.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={submitShareInvite} className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Invite member
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <input
                      value={inviteInput}
                      onChange={(e) => setInviteInput(e.target.value)}
                      placeholder="email@company.com or @handle"
                      className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <div className="flex shrink-0 gap-2">
                      <select
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(e.target.value as "viewer" | "editor" | "admin")
                        }
                        className="rounded-xl border border-zinc-300 bg-white px-2 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        aria-label="Member role"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="submit"
                        disabled={inviting || !inviteInput.trim()}
                        className="rounded-xl bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        {inviting ? "…" : "Invite"}
                      </button>
                    </div>
                  </div>
                  {inviteError ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{inviteError}</p>
                  ) : null}
                </form>
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Members
                  </div>
                  {membersLoading ? (
                    <p className="mt-2 text-sm text-zinc-500">Loading…</p>
                  ) : step2Members.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">No members yet besides you.</p>
                  ) : (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                      {step2Members.map((m) => (
                        <li
                          key={m.userId}
                          className="flex justify-between gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
                        >
                          <span className="truncate text-zinc-800 dark:text-zinc-200">
                            {m.name || m.email}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-500">{m.role}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Projects</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Organize blocks, components, and themes into reusable groups. Each project has its own
            members and permissions; use them to scope what AI tools can access.
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Current scope: {props.scopeLabel ?? "Personal"}
          </p>
        </>
      )}

      <div className={isProjectDetail ? "mt-6" : "mt-4"}>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            resetCreateWizard();
            if (!open) setCreating(false);
          }}
        >
          {!isProjectDetail ? (
            <DialogTrigger
              render={
                <button
                  type="button"
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                />
              }
            >
              New project
            </DialogTrigger>
          ) : null}
          <DialogContent className="max-w-md gap-5 px-5 pt-5 pb-5">
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
              <DialogDescription>
                {createStep === 1
                  ? "Step 1 of 2 — choose a display name. The URL slug is generated automatically and is unique within this workspace (organization or your personal scope), not globally."
                  : createdProject
                    ? props.isOrgScope
                      ? "Step 2 of 2 — invite organization members by email or username (@handle). They must already belong to this organization."
                      : "Your project is ready. Member invites are available for organization projects; personal projects are owned by you only."
                    : null}
              </DialogDescription>
            </DialogHeader>

            {createStep === 1 ? (
              <form onSubmit={submitStep1} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Project name
                  </label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Marketing Blocks"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    autoFocus
                  />
                </div>

                <DialogFooter className="flex flex-row flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => closeCreateDialog()}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newTitle.trim()}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {creating ? "Creating..." : "Continue"}
                  </button>
                </DialogFooter>
              </form>
            ) : createdProject ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">{createdProject.title}</div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Slug <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">{createdProject.slug}</code>{" "}
                    · used in URLs and MCP scopes
                  </div>
                </div>

                {props.isOrgScope ? (
                  <>
                    <form onSubmit={submitInvite} className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                        Invite member
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <input
                          value={inviteInput}
                          onChange={(e) => setInviteInput(e.target.value)}
                          placeholder="email@company.com or @handle"
                          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <div className="flex shrink-0 gap-2">
                          <select
                            value={inviteRole}
                            onChange={(e) =>
                              setInviteRole(e.target.value as "viewer" | "editor" | "admin")
                            }
                            className="rounded-xl border border-zinc-300 bg-white px-2 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            aria-label="Member role"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            type="submit"
                            disabled={inviting || !inviteInput.trim()}
                            className="rounded-xl bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            {inviting ? "…" : "Invite"}
                          </button>
                        </div>
                      </div>
                      {inviteError ? (
                        <p className="text-xs text-red-600 dark:text-red-400">{inviteError}</p>
                      ) : null}
                    </form>

                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                        Members
                      </div>
                      {membersLoading ? (
                        <p className="mt-2 text-sm text-zinc-500">Loading…</p>
                      ) : step2Members.length === 0 ? (
                        <p className="mt-2 text-sm text-zinc-500">No members yet.</p>
                      ) : (
                        <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                          {step2Members.map((m) => (
                            <li
                              key={m.userId}
                              className="flex justify-between gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
                            >
                              <span className="truncate text-zinc-800 dark:text-zinc-200">
                                {m.name || m.email}
                              </span>
                              <span className="shrink-0 text-xs text-zinc-500">{m.role}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                ) : null}

                <DialogFooter className="pt-2">
                  <button
                    type="button"
                    onClick={() => closeCreateDialog()}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Done
                  </button>
                </DialogFooter>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>

      {isProjectDetail ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {!selectedId ? (
            <p className="text-sm text-zinc-500">Loading project…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={addItemId}
                  onChange={(e) => setAddItemId(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">Choose a resource to add…</option>
                  {availableToAdd.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title} ({i.type})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!addItemId}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Add
                </button>
              </div>

              <div className="mt-6">
                <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Resources</h2>
                {itemsLoading ? (
                  <p className="mt-3 text-sm text-zinc-500">Loading resources…</p>
                ) : projectItems.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 px-6 py-14 text-center dark:border-zinc-600 dark:bg-zinc-950/40">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      No resources in this project yet
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                      Add blocks, components, or themes from your registry using the dropdown above.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {projectItems.map((it) => (
                      <article
                        key={it.itemId}
                        className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {it.title}
                            </h3>
                            <p className="mt-0.5 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                              {it.name}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {it.type}
                          </span>
                        </div>
                        <div className="mt-4 flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800">
                          <button
                            type="button"
                            onClick={() => removeItem(it.itemId)}
                            className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : loading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading...</p>
      ) : projects.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          {props.isOrgScope ? "No organization projects yet." : "No projects yet."}
        </p>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {props.isOrgScope ? "Organization projects" : "Your projects"}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    if (props.projectsBasePath) {
                      router.push(`${props.projectsBasePath}/${c.id}`);
                    }
                  }}
                  title={
                    props.projectsBasePath
                      ? "Double-click to open this project in its own page"
                      : undefined
                  }
                  className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                    selectedId === c.id
                      ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-xs text-zinc-500">{c.itemCount ?? 0}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {c.slug} · {c.visibility === "private" ? "Private" : "Public"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {!selectedId ? (
              <p className="text-sm text-zinc-500">Select a project to view and manage its items.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={addItemId}
                    onChange={(e) => setAddItemId(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">Choose an item to add…</option>
                    {availableToAdd.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title} ({i.type})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={!addItemId}
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Project items
                  </div>
                  {itemsLoading ? (
                    <p className="mt-2 text-sm text-zinc-500">Loading...</p>
                  ) : projectItems.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">No items yet.</p>
                  ) : (
                    <ul className="mt-2 max-h-[45vh] space-y-2 overflow-auto pr-1">
                      {projectItems.map((it) => (
                        <li
                          key={it.itemId}
                          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {it.title}
                            </div>
                            <div className="truncate text-xs text-zinc-500">
                              {it.name} · {it.type}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(it.itemId)}
                            className="text-sm text-red-600 hover:underline dark:text-red-400"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
