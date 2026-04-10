"use client";

import dynamic from "next/dynamic";
import {
  ArtboardToolIcon,
  ComponentIcon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PublishProjectsToShell } from "@/app/(auth)/dashboard/ProjectsShellCache";
import { CreateProjectDetailsForm } from "@/app/(auth)/dashboard/CreateProjectDetailsForm";
import Folder from "@/components/Folder";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  getPreviewDefaultStoryIdFromMeta,
  getPreviewStoriesFromMeta,
} from "@/lib/preview-stories";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import {
  buildMultiStoryPreviewPageUrl,
  buildStoryPreviewArtifactStatusQuery,
  buildStoryPreviewPageUrl,
} from "@/lib/story-preview-urls";
import {
  getClientCachedValue,
  invalidateClientCachedValue,
} from "@/lib/client-cache";

const CodeBlock = dynamic(
  () => import("@/app/registry/[owner]/[name]/CodeBlock").then((mod) => mod.CodeBlock),
  {
    loading: () => <div className="text-xs text-zinc-500 dark:text-zinc-400">Loading code…</div>,
  },
);

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
type PreviewArtifactCapability =
  | "managed-artifact"
  | "compatible-artifact"
  | "runtime-only";

type PreviewArtifactStatusPayload = {
  artifactStatus: PreviewArtifactStatus;
  artifactCapability?: PreviewArtifactCapability | null;
  compatibleExternalDependencies?: string[];
  managedProviderDependencies?: string[];
  compatibleBundledDependencies?: string[];
  hostFallbackUsed?: boolean | null;
  resolvedThemeResourceRefs?: string[];
  resolvedThemeLayerSources?: Array<"resource-layer" | "project-default">;
  resolvedThemeResourceRef?: string | null;
  resolvedThemeSource?: "resource-override" | "project-default" | "none" | null;
  lastError?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

function parseThemeResourceRefsInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function formatThemeResourceRefsInput(refs: string[] | null | undefined): string {
  return (refs ?? []).join("\n");
}

function buildArtifactDeliverySummary(
  artifactStatus: PreviewArtifactStatusPayload | null,
): string | null {
  if (!artifactStatus) return null;
  if (artifactStatus.artifactStatus === "skipped") {
    return (
      artifactStatus.lastError?.message ??
      "Preview artifact prebundle was skipped by policy."
    );
  }
  if (artifactStatus.artifactStatus === "failed") {
    return artifactStatus.lastError?.message ?? "Preview artifact build failed.";
  }
  if (artifactStatus.artifactStatus !== "ready") {
    return null;
  }

  const summaryParts: string[] = [];
  if (artifactStatus.compatibleBundledDependencies?.length) {
    summaryParts.push(
      `Bundled for faster preview: ${artifactStatus.compatibleBundledDependencies.join(", ")}.`,
    );
  } else if (
    artifactStatus.artifactCapability === "compatible-artifact" &&
    artifactStatus.compatibleExternalDependencies?.length
  ) {
    summaryParts.push(
      `Some dependencies still load at runtime: ${artifactStatus.compatibleExternalDependencies.join(", ")}.`,
    );
  } else if (artifactStatus.artifactCapability === "compatible-artifact") {
    summaryParts.push("Some dependencies still load at runtime.");
  }

  if (artifactStatus.managedProviderDependencies?.length) {
    summaryParts.push(
      `Managed by provider: ${artifactStatus.managedProviderDependencies.join(", ")}.`,
    );
  }
  if (artifactStatus.hostFallbackUsed) {
    summaryParts.push("Host fallback used.");
  }

  return summaryParts.length > 0 ? summaryParts.join(" ") : null;
}

function resolveSelectedPreviewStoryId(input: {
  currentStoryId: string | null;
  stories: Array<{ id: string }>;
  defaultStoryId: string | null;
}) {
  const normalizedCurrent = input.currentStoryId?.trim() || null;
  const normalizedDefault = input.defaultStoryId?.trim() || null;
  const availableStoryIds = new Set(
    input.stories.map((story) => story.id.trim()).filter(Boolean),
  );

  if (normalizedCurrent && availableStoryIds.has(normalizedCurrent)) {
    return normalizedCurrent;
  }
  if (normalizedDefault && availableStoryIds.has(normalizedDefault)) {
    return normalizedDefault;
  }
  return input.stories[0]?.id ?? null;
}

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

function resolveProjectItemPreviewStories(input: {
  itemMeta: Record<string, unknown> | null | undefined;
  detail: ProjectItemDetailData | null | undefined;
}) {
  const metaStories = getPreviewStoriesFromMeta(input.itemMeta);
  const detailStories = input.detail?.previewStories ?? [];
  const stories =
    metaStories.length > detailStories.length ? metaStories : detailStories;

  const metaDefaultStoryId = getPreviewDefaultStoryIdFromMeta(input.itemMeta);
  const detailDefaultStoryId = input.detail?.previewDefaultStoryId ?? null;
  const availableStoryIds = new Set(stories.map((story) => story.id));
  const defaultStoryId =
    (detailDefaultStoryId && availableStoryIds.has(detailDefaultStoryId)
      ? detailDefaultStoryId
      : null) ??
    (metaDefaultStoryId && availableStoryIds.has(metaDefaultStoryId)
      ? metaDefaultStoryId
      : null);

  return { stories, defaultStoryId };
}

function isCodeFile(path: string): boolean {
  return /\.(tsx?|jsx?|css|json)$/i.test(path);
}

/** Keep several preview iframes mounted so switching resources reuses loaded documents (no full remount / white flash). */
const PREVIEW_WARM_SLOTS_MAX = 6;

type WarmPreviewSlot = {
  itemId: string;
  projectKey: string | null;
  name: string;
  title: string;
};

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

function getProjectPreviewSlotPlaceholderClass(type: string) {
  const normalizedType = normalizeRegistryItemType(type);
  if (normalizedType === REGISTRY_UI_TYPE) {
    return "bg-violet-100/80 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300";
  }
  if (normalizedType === REGISTRY_THEME_TYPE) {
    return "bg-sky-100/80 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
  }
  if (normalizedType === REGISTRY_BLOCK_TYPE) {
    return "bg-amber-100/80 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  }
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

function getProjectFolderColor(visibility: "public" | "private" | null | undefined) {
  return visibility === "public" ? "#0F9B8E" : "#5B3DF5";
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
  const [removeOpen, setRemoveOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [itemActionPending, setItemActionPending] = useState<
    "remove" | "move" | "set-default-theme-ref" | null
  >(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [moveTargetProjectId, setMoveTargetProjectId] = useState<string>("");
  const [warmPreviewSlots, setWarmPreviewSlots] = useState<WarmPreviewSlot[]>([]);
  const [projectThemeLayersInput, setProjectThemeLayersInput] = useState("");
  const [projectThemeLayersSaving, setProjectThemeLayersSaving] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
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
  const selectedProjectStoryId = useMemo(() => {
    if (!selectedItemId) return null;
    return resolveSelectedPreviewStoryId({
      currentStoryId: selectedStoryIdByItemId[selectedItemId] ?? null,
      stories: selectedProjectPreviewStories.stories,
      defaultStoryId: selectedProjectPreviewStories.defaultStoryId,
    });
  }, [selectedItemId, selectedProjectPreviewStories, selectedStoryIdByItemId]);

  useEffect(() => {
    setProjectThemeLayersInput(
      formatThemeResourceRefsInput(selectedProject?.defaultThemeResourceRefs),
    );
  }, [selectedProject?.id, selectedProject?.defaultThemeResourceRefs]);
  const moveTargetProjects = useMemo(
    () => projects.filter((project) => project.id !== selectedId),
    [projects, selectedId],
  );
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
            `/api/r/${encodeURIComponent(props.registryOwner)}/${encodeURIComponent(item.name)}${
              currentProjectNamespaceKey
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
    refreshSelectedItems(selectedId).catch(() => {});
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

  useEffect(() => {
    if (!moveOpen) return;
    const firstTarget = moveTargetProjects[0]?.id ?? "";
    setMoveTargetProjectId((current) =>
      current && moveTargetProjects.some((project) => project.id === current) ? current : firstTarget,
    );
    setItemActionError(null);
  }, [moveOpen, moveTargetProjects]);

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
    defaultThemeResourceRefsInput: string;
  }) {
    if (!values.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title.trim(),
          visibility: "private",
          defaultThemeResourceRefs: parseThemeResourceRefsInput(
            values.defaultThemeResourceRefsInput,
          ),
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

  function handleProjectCardClick(projectId: string, href?: string) {
    if (!href) return;
    if (expandedProjectCardId !== projectId) {
      setExpandedProjectCardId(projectId);
      return;
    }
    router.push(href);
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
      invalidateClientCachedValue(`project-items:${selectedId}`);
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
      invalidateClientCachedValue(`project-items:${selectedId}`);
      invalidateClientCachedValue(`project-items:${moveTargetProjectId}`);
      invalidateClientCachedValue("projects:");
      await Promise.all([
        refreshSelectedItems(selectedId, { force: true }),
        refreshProjects({ force: true }),
      ]);
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

  async function handleSaveProjectThemeLayers() {
    if (!selectedId) return;
    const nextThemeResourceRefs = parseThemeResourceRefsInput(projectThemeLayersInput);
    setProjectThemeLayersSaving(true);
    setItemActionError(null);
    try {
      const response = await fetch(`/api/projects/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultThemeResourceRefs: nextThemeResourceRefs }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to update project theme layers");
      }
      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedId
            ? {
                ...project,
                defaultThemeResourceRefs: nextThemeResourceRefs,
                defaultThemeResourceRef: nextThemeResourceRefs[0] ?? null,
              }
            : project,
        ),
      );
      invalidateClientCachedValue(projectsCacheKey);
      invalidateClientCachedValue("projects:");
    } catch (error) {
      setItemActionError(
        error instanceof Error ? error.message : "Failed to update project theme layers",
      );
      if (typeof window !== "undefined") {
        window.alert(
          error instanceof Error ? error.message : "Failed to update project theme layers",
        );
      }
    } finally {
      setProjectThemeLayersSaving(false);
    }
  }

  return (
    <section className={props.className ?? "h-full"}>
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
              <Input
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="email@company.com or @handle"
                className="h-10 min-w-0 flex-1 rounded-xl text-sm md:text-sm"
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
              </DialogHeader>

              {createStep === 1 ? (
                <CreateProjectDetailsForm
                  creating={creating}
                  onSubmit={submitStep1}
                  onCancel={closeCreateDialog}
                />
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
                          <Input
                            value={inviteInput}
                            onChange={(e) => setInviteInput(e.target.value)}
                            placeholder="email@company.com or @handle"
                            className="h-10 min-w-0 flex-1 rounded-xl text-sm md:text-sm"
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
        <div className="h-full min-h-0">
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
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    {selectedProject?.title ?? props.initialProjectTitle ?? "Project"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>
                      Slug{" "}
                      <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {selectedProject?.slug ?? props.initialProjectSlug ?? "unknown"}
                      </code>
                    </span>
                    <span>·</span>
                    <span>{selectedProject?.visibility ?? props.initialProjectVisibility ?? "private"}</span>
                    <span>·</span>
                    <span className="font-mono">{selectedProject?.namespaceKey ?? "project"}</span>
                  </div>
                </div>
                {canEditProject ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          Project theme layers
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          One registry ref per line. Layers are injected in order.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSaveProjectThemeLayers()}
                        disabled={projectThemeLayersSaving}
                        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {projectThemeLayersSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                    <Textarea
                      value={projectThemeLayersInput}
                      onChange={(e) => setProjectThemeLayersInput(e.target.value)}
                      rows={3}
                      placeholder={"@indeed-cozy/ds/theme\n@indeed-cozy/ds/components"}
                      className="mt-3 rounded-xl text-sm md:text-sm dark:bg-zinc-950"
                    />
                  </div>
                ) : null}
              </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
              <section className="flex min-h-0 flex-col border-b border-zinc-200/80 lg:border-r lg:border-b-0 dark:border-zinc-800">
                <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
                  {projectItems.map((it) => {
                    const active = it.itemId === selectedItemId;
                    const typeIcon = getProjectItemTypeIcon(it.type);
                    const isThemeResource = normalizeRegistryItemType(it.type) === REGISTRY_THEME_TYPE;
                    const candidateDefaultThemeRef = `@${props.registryOwner}/${it.name}`;
                    const isCurrentProjectDefaultTheme =
                      (selectedProject?.defaultThemeResourceRefs ?? []).includes(
                        candidateDefaultThemeRef,
                      );
                    return (
                      <ContextMenu
                        key={it.itemId}
                        onOpenChange={(open) => {
                          if (open) selectProjectItem(it.itemId);
                        }}
                      >
                        <ContextMenuTrigger>
                          <button
                            type="button"
                            onClick={() => selectProjectItem(it.itemId)}
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
                                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                  {it.title}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                                  {it.name}
                                </p>
                              </div>
                            </div>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-52">
                          <ContextMenuLabel className="truncate">{it.title}</ContextMenuLabel>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            disabled={!canEditProject || itemActionPending !== null}
                            onClick={() => openMoveDialogForItem(it.itemId)}
                          >
                            Move resource
                          </ContextMenuItem>
                          <ContextMenuItem
                            variant="destructive"
                            disabled={!canEditProject || itemActionPending !== null}
                            onClick={() => openRemoveDialogForItem(it.itemId)}
                          >
                            Remove resource
                          </ContextMenuItem>
                          {isThemeResource ? (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                disabled={
                                  !canEditProject || itemActionPending !== null || isCurrentProjectDefaultTheme
                                }
                                onClick={() => handleSetProjectDefaultThemeRef(it)}
                              >
                                {isCurrentProjectDefaultTheme
                                  ? "Already project default source ref"
                                  : "Set as project default source ref"}
                              </ContextMenuItem>
                            </>
                          ) : null}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>
              </section>

              <section className="flex min-h-0 flex-col overflow-hidden">
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
                        return artifactStatus.artifactCapability === "compatible-artifact"
                          ? "Compatibility mode"
                          : "Artifact ready";
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
                    buildArtifactDeliverySummary(artifactStatus);
                  const resolvedThemeRefs =
                    artifactStatus?.resolvedThemeResourceRefs ?? [];
                  const resolvedThemeLabel =
                    resolvedThemeRefs.length > 0
                      ? `Theme layers: ${resolvedThemeRefs.join(" -> ")}`
                      : artifactStatus?.resolvedThemeSource === "none"
                        ? "No resolved theme"
                        : null;
                  const storiesPreviewHref =
                    selectedItem && selectedProjectPreviewStories.stories.length
                      ? buildMultiStoryPreviewPageUrl({
                          owner: props.registryOwner,
                          name: selectedItem.name,
                          project: currentProjectNamespaceKey,
                          storyId: selectedProjectStoryId,
                        })
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
                                {resolvedThemeLabel ? (
                                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                    {resolvedThemeLabel}
                                  </span>
                                ) : null}
                                {artifactStatusMessage ? (
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {artifactStatusMessage}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            {detailTab === "preview" &&
                            selectedProjectPreviewStories.stories.length ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                  Story:
                                </span>
                                <select
                                  aria-label="Select story"
                                  value={selectedProjectStoryId ?? ""}
                                  onChange={(event) => {
                                    if (!selectedItem) return;
                                    const next = event.target.value.trim();
                                    setSelectedStoryIdByItemId((prev) => ({
                                      ...prev,
                                      [selectedItem.itemId]: next.length > 0 ? next : null,
                                    }));
                                  }}
                                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                  {selectedProjectPreviewStories.stories.map((story) => (
                                    <option key={story.id} value={story.id}>
                                      {story.title}
                                    </option>
                                  ))}
                                </select>
                                {selectedProjectPreviewStories.stories.length > 1 && storiesPreviewHref ? (
                                  <Link
                                    href={storiesPreviewHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                                  >
                                    Open stories page
                                  </Link>
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
                        <div className="flex flex-1 min-h-0 items-center justify-center text-sm text-zinc-500">
                          Select a resource to preview.
                        </div>
                      ) : (
                        <>
                        <div
                          className={`relative isolate min-h-0 flex-1 ${detailTab !== "preview" ? "hidden" : ""}`}
                          aria-hidden={detailTab !== "preview"}
                        >
                          {previewSlotsToRender.map((slot) => {
                            const isActive =
                              selectedItem.itemId === slot.itemId &&
                              currentProjectNamespaceKey === slot.projectKey;
                            const slotDetail = detailByItemId[slot.itemId] ?? null;
                            const slotProjectItem =
                              projectItems.find((it) => it.itemId === slot.itemId) ?? null;
                            const slotPreviewStories = resolveProjectItemPreviewStories({
                              itemMeta: slotProjectItem?.meta ?? null,
                              detail: slotDetail,
                            });
                            const slotStoryId =
                              slotPreviewStories.stories.length > 0
                                ? resolveSelectedPreviewStoryId({
                                    currentStoryId: isActive
                                      ? selectedStoryIdByItemId[slot.itemId] ?? null
                                      : null,
                                    stories: slotPreviewStories.stories,
                                    defaultStoryId: slotPreviewStories.defaultStoryId,
                                  })
                                : null;
                            const src =
                              slotPreviewStories.stories.length > 1
                                ? buildMultiStoryPreviewPageUrl({
                                    owner: props.registryOwner,
                                    name: slot.name,
                                    project: slot.projectKey,
                                    storyId: slotStoryId,
                                  })
                                : buildStoryPreviewPageUrl({
                                    owner: props.registryOwner,
                                    name: slot.name,
                                    project: slot.projectKey,
                                    storyId: slotStoryId,
                                  });
                            return (
                              <div
                                key={`${slot.itemId}:${slot.projectKey ?? ""}`}
                                className="absolute inset-0 overflow-hidden"
                                style={{
                                  opacity: isActive ? 1 : 0,
                                  pointerEvents: isActive ? "auto" : "none",
                                  zIndex: isActive ? 2 : 0,
                                  visibility: "visible",
                                }}
                                aria-hidden={!isActive}
                              >
                                <PreviewFrame
                                  src={src}
                                  title={`${slot.title} preview`}
                                  className="h-full w-full"
                                  interactive={isActive && detailTab === "preview"}
                                  alignX="left"
                                  alignY="top"
                                  fitMode="actual"
                                  loadImmediately
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div
                          className={`grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] ${detailTab !== "code" ? "hidden" : ""}`}
                          aria-hidden={detailTab !== "code"}
                        >
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
                        </>
                      )}
                    </>
                  );
                })()}
              </section>
            </div>
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
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          onClick={() => setExpandedProjectCardId(null)}
        >
          {projects.map((c) => {
            const href = props.projectsBasePath ? `${props.projectsBasePath}/${c.id}` : undefined;
            const previews = c.previewItems ?? [];
            const total = c.itemCount ?? 0;
            const extra = total > 4 ? total - 4 : 0;
            const isExpanded = expandedProjectCardId === c.id;
            const cardClass = `group bg-secondary/50 rounded-[28px] border p-3 text-left transition ${
              isExpanded
                ? "border-violet-300 bg-violet-50/50 shadow-[0_0_0_1px_rgba(139,92,246,0.08)] dark:border-violet-500/50 dark:bg-violet-500/10"
                : "border-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
            }`;

            const inner = (
              <>
                <div className="flex min-h-[220px] items-center justify-center rounded-[32px] bg-radial-[circle_at_top,#ffffff,transparent_62%] from-white via-transparent to-transparent px-4 py-6 dark:bg-radial-[circle_at_top,rgba(255,255,255,0.06),transparent_62%]">
                  <Folder
                    interactive={false}
                    open={isExpanded}
                    shellOpen
                    color={getProjectFolderColor(c.visibility)}
                    size={1.72}
                    className="origin-center transition duration-300 group-hover:scale-[1.03]"
                    items={previews.slice(0, 3).map((it, i) => {
                      const typeIcon = getProjectItemTypeIcon(it.type);
                      const placeholderClass = getProjectPreviewSlotPlaceholderClass(it.type);
                      return (
                        <div
                          key={`${c.id}-folder-item-${i}`}
                          className="size-full"
                        >
                          {it.thumbnailUrl ? (
                            <div className="relative size-full overflow-hidden rounded-[10px]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={it.thumbnailUrl}
                                alt=""
                                className="absolute inset-0 size-full object-cover"
                              />
                            </div>
                          ) : (
                            <div
                              className={`flex size-full items-center justify-center ${placeholderClass}`}
                              aria-hidden="true"
                            >
                              <HugeiconsIcon
                                icon={typeIcon.icon ?? ArtboardToolIcon}
                                size={18}
                                strokeWidth={1.8}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  />
                </div>
                <div className="mt-2 flex items-start justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <span className="block truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {c.title}
                    </span>
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-mono">{c.slug}</span>
                      {extra > 0 ? (
                        <span className="ml-2 font-sans text-zinc-400 dark:text-zinc-500">
                          +{extra} more
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className="mt-0.5 shrink-0 rounded-full border border-zinc-200/80 bg-white/80 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                    {c.visibility === "private" ? "Private" : "Public"}
                  </span>
                </div>
              </>
            );

            return href ? (
              <button
                key={c.id}
                type="button"
                className={cardClass}
                onClick={(event) => {
                  event.stopPropagation();
                  handleProjectCardClick(c.id, href);
                }}
              >
                {inner}
              </button>
            ) : (
              <div
                key={c.id}
                className={cardClass}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedProjectCardId(c.id);
                }}
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
