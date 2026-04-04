"use client";

import {
  ArtboardToolIcon,
  ComponentIcon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublishProjectsToShell } from "@/app/(auth)/dashboard/ProjectsShellCache";
import { CodeBlock } from "@/app/registry/[owner]/[name]/CodeBlock";
import { PreviewFrame } from "@/app/components/PreviewFrame";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { extractPropsFromTsx } from "@/lib/validate-tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectItemRow } from "@/lib/project-items";
import type { ProjectListItem } from "@/lib/project-list";
import type { PreviewStory } from "@/lib/preview-stories";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { buildStoryPreviewArtifactStatusQuery } from "@/lib/story-preview-urls";

type Project = ProjectListItem;

type CreatedProject = { id: string; slug: string; title: string };

type MemberRow = { userId: string; role: string; name: string | null; email: string };

type ProjectItemDetailData = {
  type: string;
  dependencies: string[];
  registryDependencies: string[];
  previewStories: PreviewStory[];
  previewDefaultStoryId: string | null;
  files: { path: string; content: string; type: string }[];
};

type PreviewArtifactStatus =
  | "missing"
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "skipped";

type PreviewArtifactStatusPayload = {
  artifactStatus: PreviewArtifactStatus;
  lastError?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

function normalizeProjectItemDetailData(value: unknown): ProjectItemDetailData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const rawFiles = Array.isArray(data.files) ? data.files : [];
  const rawPreviewStories = Array.isArray(data.previewStories) ? data.previewStories : [];
  const files = rawFiles
    .filter((file): file is Record<string, unknown> => !!file && typeof file === "object")
    .map((file) => ({
      path: typeof file.path === "string" ? file.path : "",
      content: typeof file.content === "string" ? file.content : "",
      type: typeof file.type === "string" ? file.type : "registry:ui",
    }))
    .filter((file) => file.path.length > 0);
  return {
    type: typeof data.type === "string" ? data.type : "registry:ui",
    dependencies: Array.isArray(data.dependencies)
      ? data.dependencies.filter((dep): dep is string => typeof dep === "string")
      : [],
    registryDependencies: Array.isArray(data.registryDependencies)
      ? data.registryDependencies.filter((dep): dep is string => typeof dep === "string")
      : [],
    previewStories: rawPreviewStories
      .filter((story): story is Record<string, unknown> => !!story && typeof story === "object")
      .map((story) => ({
        id: typeof story.id === "string" ? story.id : "",
        title:
          typeof story.title === "string" && story.title.trim().length > 0
            ? story.title
            : typeof story.id === "string"
              ? story.id
              : "Story",
        props:
          story.props && typeof story.props === "object" && !Array.isArray(story.props)
            ? (story.props as Record<string, unknown>)
            : undefined,
        export: typeof story.export === "string" ? story.export : undefined,
      }))
      .filter((story) => story.id.trim().length > 0),
    previewDefaultStoryId:
      typeof data.previewDefaultStoryId === "string" && data.previewDefaultStoryId.trim().length > 0
        ? data.previewDefaultStoryId.trim()
        : null,
    files,
  };
}

function isCodeFile(path: string): boolean {
  return /\.(tsx?|jsx?|css|json)$/i.test(path);
}

function getProjectItemTypeIcon(type: string) {
  const normalizedType = normalizeRegistryItemType(type);
  if (normalizedType === REGISTRY_UI_TYPE) {
    return {
      icon: ComponentIcon,
      className:
        "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    };
  }
  if (normalizedType === REGISTRY_THEME_TYPE) {
    return {
      icon: PaintBoardIcon,
      className:
        "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    };
  }
  if (normalizedType === REGISTRY_BLOCK_TYPE) {
    return {
      icon: ArtboardToolIcon,
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    };
  }
  return {
    icon: ArtboardToolIcon,
    className:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
}

export function ProjectsPanel(props: {
  /** Registry path segment for item links (`@handle` scope or org slug). */
  registryOwner: string;
  className?: string;
  scopeLabel?: string;
  isOrgScope?: boolean;
  canEditProject?: boolean;
  /** e.g. `/me/projects` or `/workspace/acme/projects` — enables double-click to open project URL */
  projectsBasePath?: string;
  /** When set (project detail route), pre-select project and show back link */
  initialProjectId?: string | null;
  /** From server on detail route — immediate title / meta before client project list loads */
  initialProjectTitle?: string;
  initialProjectSlug?: string;
  initialProjectVisibility?: "public" | "private";
  initialProjects?: Project[];
  initialProjectItems?: ProjectItemRow[];
}) {
  const isProjectDetail = Boolean(props.initialProjectId);
  const [projects, setProjects] = useState<Project[]>(() => props.initialProjects ?? []);
  const [loading, setLoading] = useState(() => props.initialProjects == null);
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
  const [projectItems, setProjectItems] = useState<ProjectItemRow[]>(() => props.initialProjectItems ?? []);
  const [itemsLoading, setItemsLoading] = useState(
    () => isProjectDetail && props.initialProjectItems == null,
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [previewKeepAliveItemIds, setPreviewKeepAliveItemIds] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"preview" | "code">("preview");
  const [detailByItemId, setDetailByItemId] = useState<Record<string, ProjectItemDetailData>>({});
  const [artifactStatusByItemId, setArtifactStatusByItemId] = useState<
    Record<string, PreviewArtifactStatusPayload | null>
  >({});
  const [itemDetailLoadingId, setItemDetailLoadingId] = useState<string | null>(null);
  const [itemDetailError, setItemDetailError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [itemActionPending, setItemActionPending] = useState<"remove" | "move" | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [moveTargetProjectId, setMoveTargetProjectId] = useState<string>("");

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );
  const canEditProject = props.canEditProject ?? false;
  const currentProjectNamespaceKey = selectedProject?.namespaceKey ?? null;
  const moveTargetProjects = useMemo(
    () => projects.filter((project) => project.id !== selectedId),
    [projects, selectedId],
  );

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

  const ensureItemDetail = useCallback(async (item: ProjectItemRow) => {
    if (detailByItemId[item.itemId]) return;
    setItemDetailLoadingId(item.itemId);
    setItemDetailError(null);
    try {
      const res = await fetch(
        `/api/r/${encodeURIComponent(props.registryOwner)}/${encodeURIComponent(item.name)}${
          currentProjectNamespaceKey
            ? `?project=${encodeURIComponent(currentProjectNamespaceKey)}`
            : ""
        }`,
        { cache: "force-cache" },
      );
      if (!res.ok) {
        setItemDetailError(`Failed to load (${res.status})`);
        return;
      }
      const rawData = (await res.json()) as unknown;
      const detail = normalizeProjectItemDetailData(rawData);
      if (!detail) {
        setItemDetailError("Invalid detail response");
        return;
      }
      setDetailByItemId((prev) => ({ ...prev, [item.itemId]: detail }));
    } catch {
      setItemDetailError("Failed to load detail");
    } finally {
      setItemDetailLoadingId((current) => (current === item.itemId ? null : current));
    }
  }, [currentProjectNamespaceKey, detailByItemId, props.registryOwner]);

  useEffect(() => {
    if (props.initialProjects != null) {
      setProjects(props.initialProjects);
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        await refreshProjects();
      } finally {
        setLoading(false);
      }
    })();
  }, [props.initialProjects]);

  useEffect(() => {
    if (!isProjectDetail || !selectedId) return;
    if (props.initialProjectItems != null && props.initialProjectId === selectedId) {
      setProjectItems(props.initialProjectItems);
      setItemsLoading(false);
      return;
    }
    refreshSelectedItems(selectedId).catch(() => {});
  }, [selectedId, isProjectDetail, props.initialProjectId, props.initialProjectItems]);

  useEffect(() => {
    const selectedItem = projectItems.find((it) => it.itemId === selectedItemId);
    const selectedDetail = selectedItemId ? detailByItemId[selectedItemId] : null;
    if (!selectedItem || !selectedDetail) return;

    const selectedStoryId =
      selectedDetail.previewDefaultStoryId ?? selectedDetail.previewStories[0]?.id ?? null;
    const controller = new AbortController();
    const selectedItemIdValue = selectedItem.itemId;
    const selectedItemName = selectedItem.name;

    async function loadArtifactStatus() {
      try {
        const search = buildStoryPreviewArtifactStatusQuery({
          owner: props.registryOwner,
          name: selectedItemName,
          project: currentProjectNamespaceKey,
          storyId: selectedStoryId,
          enqueue: true,
        });
        const res = await fetch(`/api/registry/preview-artifacts/status?${search.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setArtifactStatusByItemId((prev) => ({ ...prev, [selectedItemIdValue]: null }));
          return;
        }
        const data = (await res.json()) as PreviewArtifactStatusPayload;
        setArtifactStatusByItemId((prev) => ({ ...prev, [selectedItemIdValue]: data }));
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setArtifactStatusByItemId((prev) => ({ ...prev, [selectedItemIdValue]: null }));
      }
    }

    void loadArtifactStatus();
    return () => {
      controller.abort();
    };
  }, [
    currentProjectNamespaceKey,
    detailByItemId,
    projectItems,
    props.registryOwner,
    selectedItemId,
  ]);

  useEffect(() => {
    if (!isProjectDetail) return;
    if (!projectItems.length) {
      setSelectedItemId(null);
      return;
    }
    const nextId =
      selectedItemId && projectItems.some((it) => it.itemId === selectedItemId)
        ? selectedItemId
        : projectItems[0]?.itemId ?? null;
    setSelectedItemId(nextId);
  }, [isProjectDetail, projectItems, selectedItemId]);

  useEffect(() => {
    setDetailTab("preview");
  }, [selectedItemId]);

  useEffect(() => {
    if (!isProjectDetail || !selectedItemId) return;
    const selectedItem = projectItems.find((it) => it.itemId === selectedItemId);
    if (!selectedItem) return;
    void ensureItemDetail(selectedItem);
    const index = projectItems.findIndex((it) => it.itemId === selectedItemId);
    const neighbors = [projectItems[index + 1], projectItems[index + 2]].filter(Boolean) as ProjectItemRow[];
    neighbors.forEach((item) => {
      void ensureItemDetail(item);
    });
  }, [ensureItemDetail, isProjectDetail, selectedItemId, projectItems]);

  useEffect(() => {
    if (!isProjectDetail || !selectedItemId) {
      setPreviewKeepAliveItemIds([]);
      return;
    }
    const selectedIndex = projectItems.findIndex((it) => it.itemId === selectedItemId);
    const neighborIds = [
      projectItems[selectedIndex + 1]?.itemId,
      projectItems[selectedIndex + 2]?.itemId,
    ].filter((id): id is string => Boolean(id));
    const MAX_PREVIEW_KEEPALIVE = 12;
    setPreviewKeepAliveItemIds((prev) => {
      const head = [selectedItemId, ...neighborIds];
      const rest = prev.filter(
        (id) => projectItems.some((it) => it.itemId === id) && !head.includes(id),
      );
      return [...head, ...rest].slice(0, MAX_PREVIEW_KEEPALIVE);
    });
  }, [isProjectDetail, selectedItemId, projectItems]);

  useEffect(() => {
    if (props.initialProjectId) {
      setSelectedId(props.initialProjectId);
    }
  }, [props.initialProjectId]);

  useEffect(() => {
    if (!moveOpen) return;
    const firstTarget = moveTargetProjects[0]?.id ?? "";
    setMoveTargetProjectId((current) =>
      current && moveTargetProjects.some((project) => project.id === current) ? current : firstTarget,
    );
    setItemActionError(null);
  }, [moveOpen, moveTargetProjects]);

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

  useEffect(() => {
    if (!props.isOrgScope) return;
    const handleShareIntent = () => setShareOpen(true);
    window.addEventListener("project-share-intent", handleShareIntent);
    return () => window.removeEventListener("project-share-intent", handleShareIntent);
  }, [props.isOrgScope]);

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

  async function handleRemoveSelectedItem() {
    if (!selectedId || !selectedItemId) return;
    const removedItemId = selectedItemId;
    setItemActionPending("remove");
    setItemActionError(null);
    try {
      const response = await fetch(`/api/projects/${selectedId}/items/${removedItemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to remove resource");
      }

      const remainingItems = projectItems.filter((item) => item.itemId !== removedItemId);
      const removedIndex = projectItems.findIndex((item) => item.itemId === removedItemId);
      const nextSelectedItem =
        remainingItems[removedIndex] ??
        remainingItems[Math.max(0, removedIndex - 1)] ??
        null;

      setProjectItems(remainingItems);
      setSelectedItemId(nextSelectedItem?.itemId ?? null);
      setSelectedPath(null);
      setPreviewKeepAliveItemIds((current) => current.filter((itemId) => itemId !== removedItemId));
      setDetailByItemId((current) => {
        const next = { ...current };
        delete next[removedItemId];
        return next;
      });

      setRemoveOpen(false);
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : "Failed to remove resource");
    } finally {
      setItemActionPending(null);
    }
  }

  async function handleMoveSelectedItem() {
    if (!selectedId || !selectedItemId || !moveTargetProjectId) return;
    setItemActionPending("move");
    setItemActionError(null);
    try {
      const addResponse = await fetch(`/api/projects/${moveTargetProjectId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selectedItemId }),
      });
      if (!addResponse.ok) {
        const data = (await addResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to add resource to target project");
      }

      const removeResponse = await fetch(`/api/projects/${selectedId}/items/${selectedItemId}`, {
        method: "DELETE",
      });
      if (!removeResponse.ok) {
        const data = (await removeResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          data?.error ??
            "Resource was added to the target project, but removing it from the current project failed",
        );
      }

      setMoveOpen(false);
      await Promise.all([refreshSelectedItems(selectedId), refreshProjects()]);
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : "Failed to move resource");
    } finally {
      setItemActionPending(null);
    }
  }

  return (
    <section className={props.className ?? ""}>
      <PublishProjectsToShell projects={projects} />
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
                  onChange={(e) => setInviteRole(e.target.value as "viewer" | "editor" | "admin")}
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

      {!isProjectDetail ? (
        <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Projects
          </h2>
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              resetCreateWizard();
              if (!open) setCreating(false);
            }}
          >
            <DialogTrigger
              render={
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                />
              }
            >
              Create project
            </DialogTrigger>
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
                      Slug{" "}
                      <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">
                        {createdProject.slug}
                      </code>{" "}
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
      ) : null}

      {isProjectDetail ? (
        <div className="min-h-[calc(100vh-4.5rem)]">
          {!selectedId ? (
            <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center text-sm text-zinc-500">
              Loading project…
            </div>
          ) : itemsLoading ? (
            <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center text-sm text-zinc-500">
              Loading resources…
            </div>
          ) : projectItems.length === 0 ? (
            <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center px-6 text-center">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                No resources in this project yet
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                  Add items to this project from your registry workflow or API when publishing.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[calc(100vh-4.5rem)] lg:grid-cols-[320px_minmax(0,1fr)]">
              <section className="min-h-0 border-b border-zinc-200/80 lg:border-r lg:border-b-0 dark:border-zinc-800">
                <div className="space-y-1 overflow-auto p-2 lg:h-[calc(100vh-7.5rem)]">
                  {projectItems.map((it) => {
                    const active = it.itemId === selectedItemId;
                    const typeIcon = getProjectItemTypeIcon(it.type);
                    return (
                      <button
                        key={it.itemId}
                        type="button"
                        onClick={() => {
                          setSelectedItemId(it.itemId);
                          setSelectedPath(null);
                          setItemDetailError(null);
                        }}
                        className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                          active
                            ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                            : "text-zinc-700 hover:bg-zinc-100/80 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${typeIcon.className}`}
                            aria-hidden="true"
                          >
                            <HugeiconsIcon icon={typeIcon.icon} size={18} strokeWidth={1.8} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{it.title}</p>
                            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{it.name}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="min-h-0 overflow-hidden">
                {(() => {
                  const selectedItem = projectItems.find((it) => it.itemId === selectedItemId) ?? null;
                  const selectedDetail = selectedItemId ? detailByItemId[selectedItemId] : null;
                  const artifactStatus = selectedItemId
                    ? artifactStatusByItemId[selectedItemId] ?? null
                    : null;
                  const preferredFile =
                    selectedDetail?.files.find((file) => file.path === selectedPath) ??
                    selectedDetail?.files.find((file) => /\.(tsx?|jsx?)$/i.test(file.path)) ??
                    selectedDetail?.files.find((file) => isCodeFile(file.path)) ??
                    selectedDetail?.files[0] ??
                    null;
                  const code = preferredFile?.content ?? "";
                  const propsFromCode =
                    selectedDetail?.type === "registry:theme" || !code ? [] : extractPropsFromTsx(code);
                  const artifactStatusTone = (() => {
                    switch (artifactStatus?.artifactStatus) {
                      case "ready":
                        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
                      case "skipped":
                        return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
                      case "failed":
                        return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
                      case "queued":
                      case "running":
                        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
                      default:
                        return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
                    }
                  })();
                  const artifactStatusLabel = (() => {
                    switch (artifactStatus?.artifactStatus) {
                      case "queued":
                        return "Artifact queued";
                      case "running":
                        return "Artifact building";
                      case "ready":
                        return "Artifact ready";
                      case "failed":
                        return "Artifact failed";
                      case "skipped":
                        return "Runtime preview only";
                      case "missing":
                        return "Artifact missing";
                      default:
                        return null;
                    }
                  })();
                  const artifactStatusMessage =
                    artifactStatus?.artifactStatus === "skipped"
                      ? artifactStatus.lastError?.message ??
                        "Preview artifact prebundle was skipped by policy."
                      : artifactStatus?.artifactStatus === "failed"
                        ? artifactStatus.lastError?.message ?? "Preview artifact build failed."
                        : null;
                  return (
                    <>
                      <div className="border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {selectedItem?.title ?? "Select a resource"}
                            </p>
                            {selectedItem ? (
                              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                {currentProjectNamespaceKey
                                  ? `${props.registryOwner} / ${currentProjectNamespaceKey} / ${selectedItem.name}`
                                  : `${props.registryOwner} / ${selectedItem.name}`}
                              </p>
                            ) : null}
                            {artifactStatusLabel && detailTab === "preview" ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${artifactStatusTone}`}
                                >
                                  {artifactStatusLabel}
                                </span>
                                {artifactStatusMessage ? (
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {artifactStatusMessage}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          {selectedItem ? (
                            <div className="flex shrink-0 items-center gap-2">
                              {canEditProject ? (
                                <>
                              <Dialog
                                open={moveOpen}
                                onOpenChange={(open) => {
                                  setMoveOpen(open);
                                  if (!open) setItemActionError(null);
                                }}
                              >
                                <DialogTrigger
                                  render={
                                    <button
                                      type="button"
                                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    />
                                  }
                                >
                                  Move
                                </DialogTrigger>
                                <DialogContent className="max-w-md gap-4 px-5 pt-5 pb-5">
                                  <DialogHeader>
                                    <DialogTitle>Move resource</DialogTitle>
                                    <DialogDescription>
                                      Move{" "}
                                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                        {selectedItem.title}
                                      </span>{" "}
                                      to another project in this workspace.
                                    </DialogDescription>
                                  </DialogHeader>
                                  {moveTargetProjects.length === 0 ? (
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                      Create another project first, then you can move this resource there.
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                        Target project
                                      </label>
                                      <select
                                        value={moveTargetProjectId}
                                        onChange={(event) => setMoveTargetProjectId(event.target.value)}
                                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                      >
                                        {moveTargetProjects.map((project) => (
                                          <option key={project.id} value={project.id}>
                                            {project.title} ({project.slug})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                  {itemActionError ? (
                                    <p className="text-sm text-red-600 dark:text-red-400">{itemActionError}</p>
                                  ) : null}
                                  <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
                                    <button
                                      type="button"
                                      onClick={() => setMoveOpen(false)}
                                      className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleMoveSelectedItem}
                                      disabled={
                                        itemActionPending === "move" ||
                                        !moveTargetProjectId ||
                                        moveTargetProjects.length === 0
                                      }
                                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                    >
                                      {itemActionPending === "move" ? "Moving..." : "Move resource"}
                                    </button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>

                              <Dialog
                                open={removeOpen}
                                onOpenChange={(open) => {
                                  setRemoveOpen(open);
                                  if (!open) setItemActionError(null);
                                }}
                              >
                                <DialogTrigger
                                  render={
                                    <button
                                      type="button"
                                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                                    />
                                  }
                                >
                                  Remove
                                </DialogTrigger>
                                <DialogContent className="max-w-md gap-4 px-5 pt-5 pb-5">
                                  <DialogHeader>
                                    <DialogTitle>Remove resource</DialogTitle>
                                    <DialogDescription>
                                      Remove{" "}
                                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                        {selectedItem.title}
                                      </span>{" "}
                                      from this project. The underlying registry resource will not be deleted.
                                    </DialogDescription>
                                  </DialogHeader>
                                  {itemActionError ? (
                                    <p className="text-sm text-red-600 dark:text-red-400">{itemActionError}</p>
                                  ) : null}
                                  <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
                                    <button
                                      type="button"
                                      onClick={() => setRemoveOpen(false)}
                                      className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleRemoveSelectedItem}
                                      disabled={itemActionPending === "remove"}
                                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-400"
                                    >
                                      {itemActionPending === "remove" ? "Removing..." : "Remove from project"}
                                    </button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {selectedItem ? (
                        <div className="border-b border-zinc-200/80 px-4 py-2 dark:border-zinc-800">
                          <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100/80 p-1 dark:bg-zinc-900">
                            {(["preview", "code"] as const).map((tab) => {
                              const active = detailTab === tab;
                              return (
                                <button
                                  key={tab}
                                  type="button"
                                  onClick={() => setDetailTab(tab)}
                                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                                    active
                                      ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                                  }`}
                                >
                                  {tab === "preview" ? "Preview" : "Code"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {!selectedItem ? (
                        <div className="flex h-[calc(100vh-7.5rem)] items-center justify-center text-sm text-zinc-500">
                          Select a resource to preview.
                        </div>
                      ) : detailTab === "preview" ? (
                        <div className="relative h-[calc(100vh-10.5rem)]">
                          {previewKeepAliveItemIds.map((itemId) => {
                            const previewItem = projectItems.find((it) => it.itemId === itemId);
                            if (!previewItem) return null;
                            const active = selectedItemId === itemId;
                            return (
                              <div
                                key={itemId}
                                className={`absolute inset-0 transition-opacity duration-150 ${
                                  active ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                                }`}
                              >
                                <PreviewFrame
                                  src={`/preview/${encodeURIComponent(props.registryOwner)}/${encodeURIComponent(previewItem.name)}${
                                    currentProjectNamespaceKey
                                      ? `?project=${encodeURIComponent(currentProjectNamespaceKey)}`
                                      : ""
                                  }`}
                                  title={`${previewItem.title} preview`}
                                  className="h-full w-full"
                                  interactive={active}
                                  alignX="left"
                                  alignY="top"
                                  fitMode="actual"
                                  loadImmediately
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="grid h-[calc(100vh-10.5rem)] min-h-0 grid-cols-[220px_minmax(0,1fr)]">
                          <div className="min-h-0 overflow-auto border-r border-zinc-200/80 p-2 dark:border-zinc-800">
                            {itemDetailLoadingId === selectedItem.itemId && !selectedDetail ? (
                              <p className="text-xs text-zinc-500">Loading…</p>
                            ) : selectedDetail?.files.length ? (
                              <div className="space-y-1">
                                {selectedDetail.files.map((file) => (
                                  <button
                                    key={file.path}
                                    type="button"
                                    onClick={() => setSelectedPath(file.path)}
                                    className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
                                      (selectedPath ? selectedPath === file.path : preferredFile?.path === file.path)
                                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                                    }`}
                                  >
                                    {file.path}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-500">{itemDetailError ?? "No files to show"}</p>
                            )}
                          </div>
                          <div className="min-h-0 overflow-auto">
                            {itemDetailError && !selectedDetail ? (
                              <div className="flex min-h-[220px] items-center justify-center px-4 text-sm text-amber-600 dark:text-amber-400">
                                {itemDetailError}
                              </div>
                            ) : (
                              <CodeBlock
                                code={code || "// source unavailable"}
                                language={
                                  preferredFile?.path?.endsWith(".css")
                                    ? "css"
                                    : preferredFile?.path?.endsWith(".json")
                                      ? "json"
                                      : "tsx"
                                }
                                variant="flush"
                                overflowMode="narrow"
                              />
                            )}
                            {propsFromCode.length > 0 ? (
                              <div className="border-t border-zinc-200/80 p-3 dark:border-zinc-800">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                                  Props
                                </p>
                                <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Optional</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {propsFromCode.map((prop) => (
                                        <TableRow key={prop.name}>
                                          <TableCell className="font-mono">{prop.name}</TableCell>
                                          <TableCell className="font-mono">{prop.type}</TableCell>
                                          <TableCell>{prop.optional ? "Yes" : "—"}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </section>
            </div>
          )}
        </div>
      ) : loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {props.isOrgScope ? "No organization projects yet." : "No projects yet."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((c) => {
            const href = props.projectsBasePath ? `${props.projectsBasePath}/${c.id}` : undefined;
            const previews = c.previewItems ?? [];
            const total = c.itemCount ?? 0;
            const extra = total > 4 ? total - 4 : 0;
            const cardClass =
              "block rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700";

            const inner = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {c.title}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {c.visibility === "private" ? "Private" : "Public"}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono">{c.slug}</span>
                  {extra > 0 ? (
                    <span className="ml-2 font-sans text-zinc-400 dark:text-zinc-500">
                      +{extra} more
                    </span>
                  ) : null}
                </p>
                <div className="mt-3 grid grid-cols-2 grid-rows-2 gap-1.5">
                  {[0, 1, 2, 3].map((i) => {
                    const it = previews[i];
                    return (
                      <div
                        key={`${c.id}-slot-${i}`}
                        className="flex min-h-17 flex-col justify-center rounded-xl border border-zinc-100 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/50"
                      >
                        {it ? (
                          <>
                            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-zinc-800 dark:text-zinc-200">
                              {it.title}
                            </span>
                            <span className="mt-0.5 truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                              {it.type}
                            </span>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            );

            return href ? (
              <Link key={c.id} href={href} className={cardClass}>
                {inner}
              </Link>
            ) : (
              <div key={c.id} className={cardClass}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
