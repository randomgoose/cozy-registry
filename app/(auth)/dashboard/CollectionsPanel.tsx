"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PublishProjectsToShell } from "@/app/(auth)/dashboard/ProjectsShellCache";
import { CreateProjectDialog } from "@/app/(auth)/dashboard/projects-panel/CreateProjectDialog";
import { ProjectDetailView } from "@/app/(auth)/dashboard/projects-panel/ProjectDetailView";
import { ProjectShareDialog } from "@/app/(auth)/dashboard/projects-panel/ProjectShareDialog";
import { ProjectsPortfolioGrid } from "@/app/(auth)/dashboard/projects-panel/ProjectsPortfolioGrid";
import { ProjectResourceActionDialogs } from "@/app/(auth)/dashboard/projects-panel/ProjectResourceActionDialogs";
import { ProjectTrashDialog } from "@/app/(auth)/dashboard/projects-panel/ProjectTrashDialog";
import {
  PREVIEW_WARM_SLOTS_MAX,
  normalizeProjectItemDetailData,
  parseThemeResourceRefsInput,
  resolveProjectItemPreviewStories,
  resolveSelectedPreviewStoryId,
} from "@/app/(auth)/dashboard/projects-panel/helpers";
import type {
  CreatedProject,
  MemberRow,
  PreviewArtifactStatusPayload,
  Project,
  ProjectItemDetailData,
  WarmPreviewSlot,
} from "@/app/(auth)/dashboard/projects-panel/types";
import type { ProjectItemRow } from "@/lib/project-items";
import { buildStoryPreviewArtifactStatusQuery } from "@/lib/story-preview-urls";
import {
  getClientCachedValue,
  invalidateClientCachedValue,
} from "@/lib/client-cache";
import { type ProjectCreateMode } from "@/lib/starter-kits";

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
  const router = useRouter();
  const isProjectDetail = Boolean(props.initialProjectId);
  const [projects, setProjects] = useState<Project[]>(() => props.initialProjects ?? []);
  const [loading, setLoading] = useState(() => props.initialProjects == null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
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
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"preview" | "code">("preview");
  const [detailByItemId, setDetailByItemId] = useState<Record<string, ProjectItemDetailData>>({});
  const [artifactStatusByItemId, setArtifactStatusByItemId] = useState<
    Record<string, PreviewArtifactStatusPayload | null>
  >({});
  const [selectedStoryIdByItemId, setSelectedStoryIdByItemId] = useState<
    Record<string, string | null>
  >({});
  const detailByItemIdRef = useRef<Record<string, ProjectItemDetailData>>({});
  const latestItemsRequestKeyRef = useRef<string | null>(null);
  const [itemDetailLoadingId, setItemDetailLoadingId] = useState<string | null>(null);
  const [itemDetailError, setItemDetailError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [expandedProjectCardId, setExpandedProjectCardId] = useState<string | null>(null);
  const [trashProjectId, setTrashProjectId] = useState<string | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [trashingProject, setTrashingProject] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [itemActionPending, setItemActionPending] = useState<
    "remove" | "move" | "set-default-theme-ref" | null
  >(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [moveTargetProjectId, setMoveTargetProjectId] = useState<string>("");
  const [warmPreviewSlots, setWarmPreviewSlots] = useState<WarmPreviewSlot[]>([]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );
  const trashProject = useMemo(
    () => projects.find((project) => project.id === trashProjectId) ?? null,
    [projects, trashProjectId],
  );
  const selectedProjectItem = useMemo(
    () => projectItems.find((it) => it.itemId === selectedItemId) ?? null,
    [projectItems, selectedItemId],
  );
  const selectedProjectDetail = useMemo(
    () => (selectedItemId ? detailByItemId[selectedItemId] ?? null : null),
    [detailByItemId, selectedItemId],
  );
  const selectedProjectPreviewStories = useMemo(() => {
    return resolveProjectItemPreviewStories({
      itemMeta: selectedProjectItem?.meta ?? null,
      detail: selectedProjectDetail,
    });
  }, [selectedProjectDetail, selectedProjectItem]);
  const canEditProject = props.canEditProject ?? false;
  const currentProjectNamespaceKey = selectedProject?.namespaceKey ?? null;
  const moveTargetProjects = useMemo(
    () => projects.filter((project) => project.id !== selectedId),
    [projects, selectedId],
  );
  const selectedProjectStoryId = useMemo(() => {
    if (!selectedItemId) return null;
    return resolveSelectedPreviewStoryId({
      currentStoryId: selectedStoryIdByItemId[selectedItemId] ?? null,
      stories: selectedProjectPreviewStories.stories,
      defaultStoryId: selectedProjectPreviewStories.defaultStoryId,
    });
  }, [selectedItemId, selectedProjectPreviewStories, selectedStoryIdByItemId]);

  useEffect(() => {
    if (!moveOpen) return;
    const firstTarget = moveTargetProjects[0]?.id ?? "";
    setMoveTargetProjectId((current) =>
      current && moveTargetProjects.some((project) => project.id === current) ? current : firstTarget,
    );
    setItemActionError(null);
  }, [moveOpen, moveTargetProjects]);
  /**
   * `warmPreviewSlots` updates in useLayoutEffect — one frame behind `selectedProjectItem`.
   * Without merging the current selection here, no slot matches `isActive` and the preview area is blank.
   */
  const previewSlotsToRender = useMemo(() => {
    if (!selectedProjectItem) return warmPreviewSlots;
    const head: WarmPreviewSlot = {
      itemId: selectedProjectItem.itemId,
      projectKey: currentProjectNamespaceKey,
      name: selectedProjectItem.name,
      title: selectedProjectItem.title,
    };
    const rest = warmPreviewSlots.filter(
      (s) => !(s.itemId === head.itemId && s.projectKey === head.projectKey),
    );
    const merged = [head, ...rest].slice(0, PREVIEW_WARM_SLOTS_MAX);
    const seenItemIds = new Set<string>();
    const deduped: WarmPreviewSlot[] = [];
    for (const slot of merged) {
      if (seenItemIds.has(slot.itemId)) continue;
      seenItemIds.add(slot.itemId);
      deduped.push(slot);
    }
    return deduped;
  }, [currentProjectNamespaceKey, selectedProjectItem, warmPreviewSlots]);

  const projectsCacheKey = useMemo(
    () => `projects:${props.registryOwner}:${props.isOrgScope ? "org" : "personal"}`,
    [props.isOrgScope, props.registryOwner],
  );

  const refreshProjects = useCallback(async (options: { force?: boolean } = {}) => {
    const data = await getClientCachedValue(
      projectsCacheKey,
      async () => {
        const res = await fetch("/api/projects", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load projects");
        return (await res.json()) as { projects: Project[] };
      },
      { ttlMs: 15_000, force: options.force },
    );
    setProjects(data.projects ?? []);
  }, [projectsCacheKey]);

  const refreshSelectedItems = useCallback(async (id: string, options: { force?: boolean } = {}) => {
    const requestKey = `${props.registryOwner}:${id}:${Date.now()}`;
    latestItemsRequestKeyRef.current = requestKey;
    setItemsLoading(true);
    try {
      const data = await getClientCachedValue(
        `project-items:${id}`,
        async () => {
          const res = await fetch(`/api/projects/${id}/items`, { cache: "no-store" });
          if (!res.ok) throw new Error("Failed to load project items");
          return (await res.json()) as { items: ProjectItemRow[] };
        },
        { ttlMs: 10_000, force: options.force },
      );
      if (latestItemsRequestKeyRef.current !== requestKey) return;
      setProjectItems(data.items ?? []);
    } finally {
      if (latestItemsRequestKeyRef.current === requestKey) {
        setItemsLoading(false);
      }
    }
  }, [props.registryOwner]);

  useEffect(() => {
    detailByItemIdRef.current = detailByItemId;
  }, [detailByItemId]);

  const ensureItemDetail = useCallback(async (item: ProjectItemRow, options: { force?: boolean } = {}) => {
    if (!options.force && detailByItemIdRef.current[item.itemId]) return;
    setItemDetailLoadingId(item.itemId);
    setItemDetailError(null);
    try {
      const detail = await getClientCachedValue(
        `project-item-detail:${props.registryOwner}:${currentProjectNamespaceKey ?? "root"}:${item.name}`,
        async () => {
          const res = await fetch(
            `/api/r/${encodeURIComponent(props.registryOwner)}/${encodeURIComponent(item.name)}${currentProjectNamespaceKey
              ? `?project=${encodeURIComponent(currentProjectNamespaceKey)}`
              : ""
            }`,
            { cache: "force-cache" },
          );
          if (!res.ok) {
            throw new Error(`Failed to load (${res.status})`);
          }
          const rawData = (await res.json()) as unknown;
          const normalized = normalizeProjectItemDetailData(rawData);
          if (!normalized) {
            throw new Error("Invalid detail response");
          }
          return normalized;
        },
        { ttlMs: 30_000, force: options.force },
      );
      setDetailByItemId((prev) => ({ ...prev, [item.itemId]: detail }));
    } catch (error) {
      setItemDetailError(error instanceof Error ? error.message : "Failed to load detail");
    } finally {
      setItemDetailLoadingId((current) => (current === item.itemId ? null : current));
    }
  }, [currentProjectNamespaceKey, props.registryOwner]);

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
  }, [props.initialProjects, refreshProjects]);

  useEffect(() => {
    if (!isProjectDetail || !selectedId) return;
    if (props.initialProjectItems != null && props.initialProjectId === selectedId) {
      latestItemsRequestKeyRef.current = null;
      setProjectItems(props.initialProjectItems);
      setItemsLoading(false);
      return;
    }
    refreshSelectedItems(selectedId).catch(() => { });
  }, [
    selectedId,
    isProjectDetail,
    props.initialProjectId,
    props.initialProjectItems,
    refreshSelectedItems,
  ]);

  useEffect(() => {
    if (!selectedProjectItem || !selectedProjectDetail) return;
    const controller = new AbortController();
    const selectedItemIdValue = selectedProjectItem.itemId;
    const selectedItemName = selectedProjectItem.name;

    async function loadArtifactStatus() {
      try {
        const search = buildStoryPreviewArtifactStatusQuery({
          owner: props.registryOwner,
          name: selectedItemName,
          project: currentProjectNamespaceKey,
          storyId: selectedProjectStoryId,
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
    props.registryOwner,
    selectedProjectDetail,
    selectedProjectItem,
    selectedProjectStoryId,
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
    setWarmPreviewSlots([]);
  }, [selectedId, props.registryOwner]);

  useLayoutEffect(() => {
    if (!selectedProjectItem) return;
    const projectKey = currentProjectNamespaceKey;
    setWarmPreviewSlots((prev) => {
      const nextEntry: WarmPreviewSlot = {
        itemId: selectedProjectItem.itemId,
        projectKey,
        name: selectedProjectItem.name,
        title: selectedProjectItem.title,
      };
      // Drop every prior slot for this item (not only same projectKey) so we never keep
      // { A, null } and { A, "ds" } — duplicate React keys when key=itemId caused white previews.
      const filtered = prev.filter((s) => s.itemId !== nextEntry.itemId);
      return [nextEntry, ...filtered].slice(0, PREVIEW_WARM_SLOTS_MAX);
    });
  }, [selectedProjectItem, currentProjectNamespaceKey]);

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
    if (props.initialProjectId) {
      latestItemsRequestKeyRef.current = null;
      setSelectedId(props.initialProjectId);
      setProjectItems(props.initialProjectItems ?? []);
      setItemsLoading(props.initialProjectItems == null);
      setSelectedItemId(null);
      setSelectedPath(null);
      setItemDetailError(null);
    }
  }, [props.initialProjectId, props.initialProjectItems]);

  async function loadStep2Members(projectId: string, options: { force?: boolean } = {}) {
    setMembersLoading(true);
    try {
      const data = await getClientCachedValue(
        `project-members:${projectId}`,
        async () => {
          const res = await fetch(`/api/projects/${projectId}/members`, { cache: "no-store" });
          return (await res.json().catch(() => null)) as { members?: MemberRow[] } | null;
        },
        { ttlMs: 10_000, force: options.force },
      );
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

  async function submitStep1(values: {
    title: string;
    createMode: ProjectCreateMode;
    defaultThemeResourceRefsInput: string;
  }) {
    if (!values.title.trim()) return;
    setCreating(true);
    try {
      const selectedThemeRefs = parseThemeResourceRefsInput(
        values.defaultThemeResourceRefsInput,
      );
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title.trim(),
          createMode: values.createMode,
          visibility: "private",
          defaultThemeResourceRefs:
            values.createMode === "empty" ? selectedThemeRefs : [],
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? "Failed to create project");
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        project?: { id: string; slug: string; title: string };
        initialization?: {
          starterKit?: string | null;
          createdItems?: string[];
          error?: string;
        };
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
      if (data?.initialization?.error) {
        alert(
          `Project created, but starter initialization did not finish: ${data.initialization.error}`,
        );
      }
      invalidateClientCachedValue("projects:");
      await refreshProjects({ force: true });
      void loadStep2Members(p.id, { force: true });
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
      invalidateClientCachedValue(`project-members:${selectedId}`);
      await loadStep2Members(selectedId, { force: true });
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
      invalidateClientCachedValue(`project-members:${createdProject.id}`);
      await loadStep2Members(createdProject.id, { force: true });
    } finally {
      setInviting(false);
    }
  }

  function resetCreateWizard() {
    setCreateStep(1);
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

  function openProjectTrashDialog(project: Project) {
    setTrashProjectId(project.id);
    setTrashError(null);
  }

  function selectProjectItem(itemId: string) {
    setSelectedItemId(itemId);
    setSelectedPath(null);
    setItemDetailError(null);
  }

  function openMoveDialogForItem(itemId: string) {
    selectProjectItem(itemId);
    setItemActionError(null);
    setMoveTargetProjectId("");
    setMoveOpen(true);
  }

  function openRemoveDialogForItem(itemId: string) {
    selectProjectItem(itemId);
    setItemActionError(null);
    setRemoveOpen(true);
  }

  function removeItemFromCurrentProjectState(removedItemId: string) {
    const remainingItems = projectItems.filter((item) => item.itemId !== removedItemId);
    const removedIndex = projectItems.findIndex((item) => item.itemId === removedItemId);
    const nextSelectedItem =
      remainingItems[removedIndex] ??
      remainingItems[Math.max(0, removedIndex - 1)] ??
      null;

    setProjectItems(remainingItems);
    setSelectedItemId(nextSelectedItem?.itemId ?? null);
    setSelectedPath(null);
    setDetailByItemId((current) => {
      const next = { ...current };
      delete next[removedItemId];
      return next;
    });
    setArtifactStatusByItemId((current) => {
      const next = { ...current };
      delete next[removedItemId];
      return next;
    });
    setSelectedStoryIdByItemId((current) => {
      const next = { ...current };
      delete next[removedItemId];
      return next;
    });
    setWarmPreviewSlots((current) => current.filter((slot) => slot.itemId !== removedItemId));
  }

  async function handleRemoveSelectedItem() {
    if (!selectedId || !selectedItemId || !currentProjectNamespaceKey) return;
    const removedItemId = selectedItemId;
    const removedItem = projectItems.find((item) => item.itemId === removedItemId) ?? null;
    if (!removedItem) return;

    setItemActionPending("remove");
    setItemActionError(null);
    try {
      const response = await fetch(`/api/projects/${selectedId}/items/${removedItemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to delete resource");
      }

      removeItemFromCurrentProjectState(removedItemId);
      invalidateClientCachedValue(`project-items:${selectedId}`);
      invalidateClientCachedValue("projects:");
      setRemoveOpen(false);
      void refreshProjects({ force: true });
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : "Failed to delete resource");
    } finally {
      setItemActionPending(null);
    }
  }

  async function handleMoveSelectedItem() {
    if (!selectedId || !selectedItemId || !moveTargetProjectId) return;
    const movedItemId = selectedItemId;
    setItemActionPending("move");
    setItemActionError(null);
    try {
      const response = await fetch(`/api/projects/${selectedId}/items/${movedItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetProjectId: moveTargetProjectId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to move resource");
      }

      removeItemFromCurrentProjectState(movedItemId);
      invalidateClientCachedValue(`project-items:${selectedId}`);
      invalidateClientCachedValue(`project-items:${moveTargetProjectId}`);
      invalidateClientCachedValue("projects:");
      setMoveOpen(false);
      void refreshProjects({ force: true });
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : "Failed to move resource");
    } finally {
      setItemActionPending(null);
    }
  }

  async function handleSetProjectDefaultThemeRef(item: ProjectItemRow) {
    if (!selectedId) return;
    const nextDefaultThemeRef = `@${props.registryOwner}/${item.name}`;
    setItemActionPending("set-default-theme-ref");
    setItemActionError(null);
    try {
      const response = await fetch(`/api/projects/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultThemeResourceRefs: [nextDefaultThemeRef] }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to set project default theme");
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedId
            ? {
              ...project,
              defaultThemeResourceRefs: [nextDefaultThemeRef],
              defaultThemeResourceRef: nextDefaultThemeRef,
            }
            : project,
        ),
      );
      invalidateClientCachedValue(projectsCacheKey);
      invalidateClientCachedValue("projects:");
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : "Failed to set project default theme");
      if (typeof window !== "undefined") {
        window.alert(error instanceof Error ? error.message : "Failed to set project default theme");
      }
    } finally {
      setItemActionPending(null);
    }
  }

  async function handleMoveProjectToTrash() {
    if (!trashProjectId) return;
    setTrashingProject(true);
    setTrashError(null);
    try {
      const response = await fetch(`/api/projects/${trashProjectId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to move project to trash");
      }
      setProjects((current) => current.filter((project) => project.id !== trashProjectId));
      invalidateClientCachedValue(projectsCacheKey);
      invalidateClientCachedValue("projects:");
      setTrashProjectId(null);
    } catch (error) {
      setTrashError(error instanceof Error ? error.message : "Failed to move project to trash");
    } finally {
      setTrashingProject(false);
    }
  }

  return (
    <section className={props.className ?? "h-full"}>
      <PublishProjectsToShell projects={projects} />
      <ProjectTrashDialog
        open={trashProjectId != null}
        onOpenChange={(open) => {
          if (!open) {
            setTrashProjectId(null);
            setTrashError(null);
          }
        }}
        projectTitle={trashProject?.title ?? null}
        deleting={trashingProject}
        error={trashError}
        onConfirm={() => void handleMoveProjectToTrash()}
      />
      <ProjectShareDialog
        open={shareOpen}
        onOpenChange={(open) => {
          setShareOpen(open);
          if (!open) {
            setInviteInput("");
            setInviteError(null);
          }
        }}
        inviteInput={inviteInput}
        onInviteInputChange={setInviteInput}
        inviteRole={inviteRole}
        onInviteRoleChange={setInviteRole}
        inviteError={inviteError}
        inviting={inviting}
        onSubmitInvite={submitShareInvite}
        membersLoading={membersLoading}
        members={step2Members}
      />

      {!isProjectDetail ? (
        <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Projects
          </h2>
          <CreateProjectDialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              resetCreateWizard();
              if (!open) setCreating(false);
            }}
            creating={creating}
            createStep={createStep}
            createdProject={createdProject}
            isOrgScope={props.isOrgScope}
            inviteInput={inviteInput}
            onInviteInputChange={setInviteInput}
            inviteRole={inviteRole}
            onInviteRoleChange={setInviteRole}
            inviteError={inviteError}
            inviting={inviting}
            membersLoading={membersLoading}
            members={step2Members}
            onSubmitStep1={submitStep1}
            onSubmitInvite={submitInvite}
            onCancel={closeCreateDialog}
          />
        </div>
      ) : null}

      {isProjectDetail ? (
        <div className="h-full min-h-0">
          <ProjectResourceActionDialogs
            selectedItemTitle={selectedProjectItem?.title ?? null}
            moveOpen={moveOpen}
            onMoveOpenChange={(open) => {
              setMoveOpen(open);
              if (!open) setItemActionError(null);
            }}
            removeOpen={removeOpen}
            onRemoveOpenChange={(open) => {
              setRemoveOpen(open);
              if (!open) setItemActionError(null);
            }}
            moveTargetProjects={moveTargetProjects}
            moveTargetProjectId={moveTargetProjectId}
            onMoveTargetProjectIdChange={setMoveTargetProjectId}
            itemActionError={itemActionError}
            itemActionPending={itemActionPending}
            onMoveConfirm={() => void handleMoveSelectedItem()}
            onRemoveConfirm={() => void handleRemoveSelectedItem()}
          />
          {!selectedId ? (
            <div className="flex h-full min-h-0 items-center justify-center text-sm text-zinc-500">
              Loading project…
            </div>
          ) : itemsLoading ? (
            <div className="flex h-full min-h-0 items-center justify-center text-sm text-zinc-500">
              Loading resources…
            </div>
          ) : projectItems.length === 0 ? (
            <div className="flex h-full min-h-0 items-center justify-center px-6 text-center">
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
            <ProjectDetailView
              registryOwner={props.registryOwner}
              initialProjectTitle={props.initialProjectTitle}
              initialProjectSlug={props.initialProjectSlug}
              initialProjectVisibility={props.initialProjectVisibility}
              canEditProject={canEditProject}
              selectedProject={selectedProject}
              currentProjectNamespaceKey={currentProjectNamespaceKey}
              projectItems={projectItems}
              selectedItemId={selectedItemId}
              onSelectProjectItem={selectProjectItem}
              onOpenMoveDialog={openMoveDialogForItem}
              onOpenRemoveDialog={openRemoveDialogForItem}
              onSetProjectDefaultThemeRef={handleSetProjectDefaultThemeRef}
              detailByItemId={detailByItemId}
              artifactStatusByItemId={artifactStatusByItemId}
              detailTab={detailTab}
              onDetailTabChange={setDetailTab}
              selectedPath={selectedPath}
              onSelectedPathChange={setSelectedPath}
              selectedProjectPreviewStories={selectedProjectPreviewStories}
              selectedProjectStoryId={selectedProjectStoryId}
              selectedStoryIdByItemId={selectedStoryIdByItemId}
              onSelectedStoryIdChange={(itemId, storyId) => {
                setSelectedStoryIdByItemId((prev) => ({
                  ...prev,
                  [itemId]: storyId,
                }));
              }}
              previewSlotsToRender={previewSlotsToRender}
              itemDetailLoadingId={itemDetailLoadingId}
              itemDetailError={itemDetailError}
              itemActionPending={itemActionPending}
              itemActionError={itemActionError}
            />
          )}
        </div>
      ) : loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <ProjectsPortfolioGrid
          projects={projects}
          projectsBasePath={props.projectsBasePath}
          isOrgScope={props.isOrgScope}
          expandedProjectCardId={expandedProjectCardId}
          onExpandedProjectCardIdChange={setExpandedProjectCardId}
          router={router}
          onMoveProjectToTrash={openProjectTrashDialog}
        />
      )}
    </section>
  );
}
