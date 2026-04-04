"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { PreviewPropsDebugPanel } from "./PreviewPropsDebugPanel";
import { RegistryFileTree } from "./RegistryFileTree";
import {
  PreviewFrame,
  type PreviewFrameHandle,
} from "./PreviewFrame";
import { CodeBlock } from "@/app/registry/[owner]/[name]/CodeBlock";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  CopyCheckIcon,
  ExpandIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PREVIEW_MSG_INITIAL_PROPS } from "@/lib/preview-messages";
import type { PreviewStory } from "@/lib/preview-stories";
import {
  buildStoryPreviewArtifactStatusQuery,
  buildStoryPreviewPageUrl,
} from "@/lib/story-preview-urls";
import {
  getDependencyDisplayName,
  type DependencyDecision,
} from "@/lib/third-party-dependency-governance";
import { filterControllableProps } from "@/lib/preview-prop-controls";
import { cn } from "@/lib/utils";
import { extractPropsFromTsx, type PropField } from "@/lib/validate-tsx";

interface ComponentCardProps {
  itemId: string;
  owner: string;
  name: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  thumbnailUrl?: string | null;
}

type ExpandedDetailData = {
  type: string;
  dependencies: string[];
  registryDependencies: string[];
  dependencyDiagnostics: DependencyDecision[];
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

type PreviewArtifactStatusPayload = {
  artifactStatus: PreviewArtifactStatus;
  lastError?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

function normalizeExpandedDetailData(
  value: unknown,
): ExpandedDetailData | null {
  if (!value || typeof value !== "object") return null;

  const data = value as Record<string, unknown>;
  const rawFiles = Array.isArray(data.files) ? data.files : [];
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
    dependencyDiagnostics: Array.isArray(data.dependencyDiagnostics)
      ? data.dependencyDiagnostics.filter(
          (entry): entry is DependencyDecision =>
            !!entry &&
            typeof entry === "object" &&
            typeof (entry as DependencyDecision).packageName === "string" &&
            typeof (entry as DependencyDecision).tier === "string" &&
            typeof (entry as DependencyDecision).previewCapability === "string" &&
            typeof (entry as DependencyDecision).versionPolicyStatus === "string",
        )
      : [],
    previewStories: Array.isArray(data.previewStories)
      ? data.previewStories.filter(
          (entry): entry is PreviewStory =>
            !!entry &&
            typeof entry === "object" &&
            typeof (entry as PreviewStory).id === "string" &&
            typeof (entry as PreviewStory).title === "string",
        )
      : [],
    previewDefaultStoryId:
      typeof data.previewDefaultStoryId === "string" &&
      data.previewDefaultStoryId.trim().length > 0
        ? data.previewDefaultStoryId.trim()
        : null,
    files,
  };
}

function isCodeFile(path: string): boolean {
  return /\.(tsx?|jsx?|css|json)$/i.test(path);
}

function registryItemJsonUrl(
  owner: string,
  name: string,
  version: string | null,
) {
  const base = `/api/r/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  if (!version) return base;
  return `${base}?v=${encodeURIComponent(version)}`;
}

/** Semver-ish descending order for version labels */
function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort((a, b) => {
    const pa = a.split(".").map((s) => parseInt(s, 10) || 0);
    const pb = b.split(".").map((s) => parseInt(s, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const da = pa[i] ?? 0;
      const db = pb[i] ?? 0;
      if (db !== da) return db - da;
    }
    return b.localeCompare(a);
  });
}

export function ComponentCard({
  itemId,
  owner,
  name,
  title,
  description,
  visibility,
  thumbnailUrl,
}: ComponentCardProps) {
  const layoutTransition = {
    type: "spring",
    stiffness: 240,
    damping: 26,
    mass: 0.95,
  } as const;
  const overlayTransition = {
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1],
  } as const;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [detailData, setDetailData] = useState<ExpandedDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  /** Last fetched detail key (owner/name); cleared when props change to avoid duplicate fetches */
  const detailLoadedKeyRef = useRef<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [collections, setCollections] = useState<
    Array<{ id: string; title: string; slug: string }>
  >([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [thumbnailScale, setThumbnailScale] = useState(1);
  const expandedPreviewRef = useRef<PreviewFrameHandle>(null);
  const [livePreviewProps, setLivePreviewProps] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [expandedMainTab, setExpandedMainTab] = useState<"preview" | "code">(
    "preview",
  );
  /** `null` = latest (no `?v=`). Otherwise pinned historical version. */
  const [selectedDetailVersion, setSelectedDetailVersion] = useState<
    string | null
  >(null);
  const [versionMeta, setVersionMeta] = useState<{
    currentVersion: string;
    versions: { version: string }[];
  } | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [artifactStatus, setArtifactStatus] =
    useState<PreviewArtifactStatusPayload | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  const vParam = useMemo(() => {
    if (selectedDetailVersion == null) return null;
    if (versionMeta && selectedDetailVersion === versionMeta.currentVersion) {
      return null;
    }
    return selectedDetailVersion;
  }, [selectedDetailVersion, versionMeta]);

  const versionOptions = useMemo(() => {
    if (!versionMeta) return [];
    const s = new Set<string>();
    s.add(versionMeta.currentVersion);
    for (const v of versionMeta.versions) {
      s.add(v.version);
    }
    return sortVersionsDesc([...s]);
  }, [versionMeta]);

  function applyFallbackThumbnailScale(width: number, height: number) {
    const ratio = width / height;

    if (ratio >= 0.82 && ratio <= 1.25) {
      setThumbnailScale(0.58);
      return;
    }

    if (ratio < 0.82) {
      setThumbnailScale(0.66);
      return;
    }

    if (ratio > 2.4) {
      setThumbnailScale(0.88);
      return;
    }

    setThumbnailScale(0.94);
  }

  async function handleThumbnailLoad(
    event: React.SyntheticEvent<HTMLImageElement>,
  ) {
    const img = event.currentTarget;
    const width = img.naturalWidth || 1;
    const height = img.naturalHeight || 1;
    const logicalWidth = width / 2;
    const logicalHeight = height / 2;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        applyFallbackThumbnailScale(width, height);
        return;
      }

      context.drawImage(img, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height).data;

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      const step = Math.max(1, Math.floor(Math.min(width, height) / 320));

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const alpha = imageData[(y * width + x) * 4 + 3];
          if (alpha <= 8) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }

      if (maxX < minX || maxY < minY) {
        applyFallbackThumbnailScale(width, height);
        return;
      }

      const visibleWidth = Math.max(1, maxX - minX);
      const visibleHeight = Math.max(1, maxY - minY);
      const widthFill = visibleWidth / width;
      const heightFill = visibleHeight / height;
      const visibleRatio = visibleWidth / visibleHeight;
      const visibleAreaFill = (visibleWidth * visibleHeight) / (width * height);

      if (logicalHeight <= 56 && logicalWidth <= 220) {
        setThumbnailScale(0.34);
        return;
      }

      if (logicalHeight <= 56 && logicalWidth <= 320) {
        setThumbnailScale(0.4);
        return;
      }

      if (logicalHeight <= 64 && visibleRatio > 1.8) {
        setThumbnailScale(0.42);
        return;
      }

      if (logicalHeight <= 80 && visibleRatio > 2.2) {
        setThumbnailScale(0.48);
        return;
      }

      if (visibleAreaFill < 0.05) {
        setThumbnailScale(0.34);
        return;
      }

      if (visibleAreaFill < 0.08) {
        setThumbnailScale(0.4);
        return;
      }

      if (visibleAreaFill < 0.12) {
        setThumbnailScale(0.46);
        return;
      }

      if (visibleAreaFill < 0.2) {
        setThumbnailScale(0.54);
        return;
      }

      if (widthFill < 0.42 && heightFill < 0.42) {
        setThumbnailScale(0.42);
        return;
      }

      if (widthFill < 0.55 && heightFill < 0.55) {
        setThumbnailScale(0.52);
        return;
      }

      if (visibleRatio >= 0.82 && visibleRatio <= 1.25 && visibleAreaFill < 0.28) {
        setThumbnailScale(0.52);
        return;
      }

      if (visibleRatio >= 0.82 && visibleRatio <= 1.25) {
        setThumbnailScale(0.64);
        return;
      }

      if (visibleRatio < 0.82) {
        setThumbnailScale(0.72);
        return;
      }

      if (visibleRatio > 2.4) {
        setThumbnailScale(0.88);
        return;
      }

      setThumbnailScale(0.92);
    } catch {
      applyFallbackThumbnailScale(width, height);
    }
  }

  const cardLayoutId = `registry-card-${itemId}`;
  const firstDisplayableFile =
    detailData?.files?.find(
      (file) =>
        isCodeFile(file.path) &&
        typeof file.content === "string" &&
        file.content.trim().length > 0,
    ) ??
    detailData?.files?.find(
      (file) =>
        typeof file.content === "string" && file.content.trim().length > 0,
    ) ??
    detailData?.files?.[0] ??
    null;
  const preferredFile =
    detailData?.files?.find((file) => file.path === selectedPath) ??
    detailData?.files?.find((file) => /\.(tsx?|jsx?)$/i.test(file.path)) ??
    detailData?.files?.find((file) => isCodeFile(file.path)) ??
    firstDisplayableFile ??
    null;
  const code = preferredFile?.content ?? "";
  const isDetailPending = detailLoading && !detailData;
  const propsFromCode = useMemo((): PropField[] => {
    if (!detailData?.type || detailData.type === "registry:theme" || !code) {
      return [];
    }
    return extractPropsFromTsx(code);
  }, [detailData?.type, code]);
  const controllablePreviewFields = useMemo(
    () => filterControllableProps(propsFromCode),
    [propsFromCode],
  );
  const installCommand = useMemo(() => {
    const path = registryItemJsonUrl(owner, name, vParam);
    if (typeof window !== "undefined") {
      return `npx shadcn@latest add ${window.location.origin}${path}`;
    }
    return `npx shadcn@latest add ${path}`;
  }, [owner, name, vParam]);
  const previewSrc = useMemo(
    () =>
      buildStoryPreviewPageUrl({
        owner,
        name,
        version: vParam,
        storyId: selectedStoryId,
      }),
    [owner, name, vParam, selectedStoryId],
  );

  async function handleCopy() {
    try {
      const currentCode =
        code || firstDisplayableFile?.content || (detailData?.files?.[0]?.content ?? "");
      if (currentCode) {
        await navigator.clipboard.writeText(currentCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      const res = await fetch(registryItemJsonUrl(owner, name, vParam), {
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const fetchedCode =
        data.files?.find((file: { path?: string }) =>
          /\.(tsx?|jsx?|css|json)$/i.test(file.path ?? ""),
        )?.content ??
        data.files?.[0]?.content ??
        "";
      if (!fetchedCode) {
        throw new Error("No code available");
      }
      await navigator.clipboard.writeText(fetchedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      alert("Copy failed. Please try again.");
    }
  }

  async function ensureCollectionsLoaded() {
    if (collectionsLoading || collections.length > 0) return;
    setCollectionsLoading(true);
    try {
      const res = await fetch("/api/collections", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { collections?: Array<{ id: string; title: string; slug: string }> }
        | null;
      setCollections(Array.isArray(data?.collections) ? data.collections : []);
    } finally {
      setCollectionsLoading(false);
    }
  }

  async function addToCollection() {
    if (!selectedCollectionId || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/collections/${selectedCollectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        alert(err?.error ?? "Failed to add to collection");
        return;
      }
      setAddOpen(false);
      setSelectedCollectionId("");
    } finally {
      setAdding(false);
    }
  }

  function stopCardClick(event: React.MouseEvent) {
    event.stopPropagation();
  }

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    }
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  useEffect(() => {
    detailLoadedKeyRef.current = null;
    setDetailData(null);
    setDetailError(null);
    setSelectedPath(null);
    setLivePreviewProps(null);
    setExpandedMainTab("preview");
    setSelectedDetailVersion(null);
    setVersionMeta(null);
    setArtifactStatus(null);
  }, [name, owner]);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    let cancelled = false;
    setVersionsLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/registry/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/versions`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setVersionMeta(null);
          return;
        }
        const data = (await res.json()) as {
          currentVersion?: string;
          versions?: { version: string }[];
        };
        if (cancelled) return;
        setVersionMeta({
          currentVersion:
            typeof data.currentVersion === "string"
              ? data.currentVersion
              : "0.1.0",
          versions: Array.isArray(data.versions) ? data.versions : [],
        });
      } catch {
        if (!cancelled) setVersionMeta(null);
      } finally {
        if (!cancelled) setVersionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [expanded, owner, name]);

  useEffect(() => {
    if (!expanded) return;

    const itemKey = `${owner}\0${name}\0${vParam ?? "latest"}`;
    if (detailLoadedKeyRef.current === itemKey) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    let cancelled = false;

    async function loadDetailData() {
      setDetailLoading(true);
      setDetailError(null);
      setDetailData(null);
      try {
        const res = await fetch(registryItemJsonUrl(owner, name, vParam), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          if (!cancelled) {
            setDetailError(`Failed to load (${res.status})`);
          }
          return;
        }
        const rawData = (await res.json()) as unknown;
        const data = normalizeExpandedDetailData(rawData);
        if (!data) {
          if (!cancelled) {
            setDetailError("Invalid detail response");
          }
          return;
        }
        if (!cancelled) {
          detailLoadedKeyRef.current = itemKey;
          setDetailData(data);
          const nextSelectedPath =
            data.files?.find((file) => /\.(tsx?|jsx?)$/i.test(file.path))?.path ??
            data.files?.find((file) => isCodeFile(file.path))?.path ??
            data.files?.find(
              (file) =>
                typeof file.content === "string" &&
                file.content.trim().length > 0,
            )?.path ??
            data.files?.[0]?.path ??
            null;
          setSelectedPath(nextSelectedPath);
          setSelectedStoryId((current) => {
            return resolveSelectedPreviewStoryId({
              currentStoryId: current,
              stories: data.previewStories,
              defaultStoryId: data.previewDefaultStoryId,
            });
          });
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        const isAbort =
          error instanceof DOMException && error.name === "AbortError";
        if (isAbort) return;
        if (!cancelled) {
          setDetailError("Failed to load or timed out");
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetailData();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
      setDetailLoading(false);
    };
  }, [expanded, name, owner, vParam]);

  useEffect(() => {
    if (expanded) return;
    setDetailError(null);
    setLivePreviewProps(null);
    setExpandedMainTab("preview");
    setSelectedDetailVersion(null);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function onPreviewMessage(ev: MessageEvent) {
      const data = ev.data as { type?: string; props?: unknown };
      if (data?.type !== PREVIEW_MSG_INITIAL_PROPS) return;
      const iframeWin = expandedPreviewRef.current?.getContentWindow();
      if (!iframeWin || ev.source !== iframeWin) return;
      // allow-same-origin: matches location.origin. Legacy sandbox-only scripts use opaque origin → "null"
      const originOk =
        ev.origin === window.location.origin || ev.origin === "null";
      if (!originOk) return;
      const next = data.props;
      if (next && typeof next === "object" && !Array.isArray(next)) {
        setLivePreviewProps({ ...(next as Record<string, unknown>) });
      }
    }
    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
  }, [expanded]);

  useEffect(() => {
    setLivePreviewProps(null);
  }, [vParam, selectedStoryId]);

  useEffect(() => {
    if (!expanded || livePreviewProps == null) return;
    expandedPreviewRef.current?.sendPreviewProps(livePreviewProps);
  }, [expanded, livePreviewProps, vParam]);

  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;

    async function loadArtifactStatus() {
      try {
        const search = buildStoryPreviewArtifactStatusQuery({
          owner,
          name,
          version: vParam,
          storyId: selectedStoryId,
          enqueue: true,
        });
        const res = await fetch(
          `/api/registry/preview-artifacts/status?${search.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) {
          if (!cancelled) {
            setArtifactStatus(null);
          }
          return;
        }
        const data = (await res.json()) as PreviewArtifactStatusPayload;
        if (!cancelled) {
          setArtifactStatus(data);
        }
      } catch {
        if (!cancelled) {
          setArtifactStatus(null);
        }
      }
    }

    void loadArtifactStatus();
    return () => {
      cancelled = true;
    };
  }, [expanded, owner, name, vParam, selectedStoryId]);

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

  const handlePreviewPropChange = useCallback((propName: string, value: unknown) => {
    setLivePreviewProps((prev) => (prev ? { ...prev, [propName]: value } : null));
  }, []);

  function renderActionButtons() {
    return (
      <div className="relative z-40 flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full bg-black/45 text-white hover:bg-black/60 hover:text-white dark:bg-black/45 dark:text-white dark:hover:bg-black/60"
          onClick={(event) => {
            stopCardClick(event);
            void handleCopy();
          }}
          aria-label={copied ? "Code copied" : "Copy code"}
          title={copied ? "Copied" : "Copy code"}
        >
          <HugeiconsIcon
            icon={copied ? CopyCheckIcon : Copy01Icon}
            strokeWidth={1.8}
          />
        </Button>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger
            onClick={(event) => {
              stopCardClick(event);
              void ensureCollectionsLoaded();
            }}
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full bg-black/45 text-white hover:bg-black/60 hover:text-white dark:bg-black/45 dark:text-white dark:hover:bg-black/60"
                aria-label="Add to collection"
                title="Add to collection"
              />
            }
          >
            <HugeiconsIcon icon={StarIcon} strokeWidth={1.8} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to collection</DialogTitle>
            </DialogHeader>

            {collectionsLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : collections.length === 0 ? (
              <p className="text-sm text-zinc-500">
                You don’t have any collections yet. Create one on the Collections page.
              </p>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Choose a collection
                </label>
                <select
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">Select…</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.title} ({collection.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="default"
                disabled={
                  !selectedCollectionId ||
                  adding ||
                  collectionsLoading ||
                  collections.length === 0
                }
                onClick={addToCollection}
              >
                {adding ? "Adding…" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  function renderFloatingActionButtons() {
    const floatingButtonClass =
      "h-11 w-11 rounded-2xl border border-white/35 bg-white/14 text-white shadow-[0_10px_30px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/20 hover:text-white hover:shadow-[0_14px_36px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.22)] dark:border-white/14 dark:bg-white/[0.08] dark:text-white dark:shadow-[0_12px_36px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:border-white/20 dark:hover:bg-white/[0.12]";

    return (
      <motion.div
        className="pointer-events-auto absolute left-full top-0 z-[60] ml-3 hidden flex-col gap-2 lg:flex"
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: 0.04 }}
      >
        <Link
          href={`/registry/${owner}/${name}`}
          className={cn(
            "inline-flex items-center justify-center",
            floatingButtonClass,
          )}
          onClick={(event) => stopCardClick(event)}
          aria-label="Open registry detail page"
          title="Open detail page"
        >
          <HugeiconsIcon icon={ExpandIcon} strokeWidth={1.8} />
        </Link>

        <Button
          variant="ghost"
          size="icon"
          className={floatingButtonClass}
          onClick={(event) => {
            stopCardClick(event);
            void handleCopy();
          }}
          aria-label={copied ? "Code copied" : "Copy code"}
          title={copied ? "Copied" : "Copy code"}
        >
          <HugeiconsIcon
            icon={copied ? CopyCheckIcon : Copy01Icon}
            strokeWidth={1.8}
          />
        </Button>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger
            onClick={(event) => {
              stopCardClick(event);
              void ensureCollectionsLoaded();
            }}
            render={
              <Button
                variant="ghost"
                size="icon"
                className={floatingButtonClass}
                aria-label="Add to collection"
                title="Add to collection"
              />
            }
          >
            <HugeiconsIcon icon={StarIcon} strokeWidth={1.8} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to collection</DialogTitle>
            </DialogHeader>

            {collectionsLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : collections.length === 0 ? (
              <p className="text-sm text-zinc-500">
                You don’t have any collections yet. Create one on the Collections page.
              </p>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Choose a collection
                </label>
                <select
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">Select…</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.title} ({collection.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="default"
                disabled={
                  !selectedCollectionId ||
                  adding ||
                  collectionsLoading ||
                  collections.length === 0
                }
                onClick={addToCollection}
              >
                {adding ? "Adding…" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  return (
    <>
      <article
        className="group relative cursor-pointer overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        onClick={() => setExpanded(true)}
      >
        <motion.div
          layoutId={cardLayoutId}
          transition={layoutTransition}
          className="relative h-56 w-full overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(255,251,245,1),rgba(255,255,255,1))] dark:bg-[linear-gradient(180deg,rgba(39,39,42,0.7),rgba(9,9,11,0.2))]"
        >
          {thumbnailUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),rgba(255,255,255,0.72)_62%,rgba(255,255,255,0.5))] dark:bg-[radial-gradient(circle_at_top,rgba(39,39,42,0.9),rgba(24,24,27,0.8)_62%,rgba(9,9,11,0.68))]">
              <Image
                src={thumbnailUrl}
                alt={`${title} thumbnail`}
                fill
                unoptimized
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-contain p-4"
                crossOrigin="anonymous"
                style={{
                  objectPosition: "center center",
                  transform: `scale(${thumbnailScale})`,
                }}
                onLoad={(event) => {
                  void handleThumbnailLoad(event);
                }}
                draggable={false}
              />
            </div>
          ) : (
            <PreviewFrame
              src={`/preview/${owner}/${name}`}
              title={`${title} preview`}
              className="h-full w-full"
              alignY="center"
              fitMode="actual"
              stageSize={{ width: 1200, height: 900 }}
            />
          )}
          <div
            className={`absolute inset-0 z-20 bg-linear-to-t from-black/80 via-black/28 to-transparent transition duration-200 ${expanded ? "opacity-0" : "opacity-0 group-hover:opacity-100"
              }`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-3 p-4 transition duration-200 ${expanded ? "opacity-0" : "opacity-0 group-hover:opacity-100"
              }`}
          >
            <div className="min-w-0">
              {visibility === "private" ? (
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/70">
                  Private
                </p>
              ) : null}
              <h2 className="line-clamp-2 text-base font-semibold text-white">
                {title}
              </h2>
            </div>
            {renderActionButtons()}
          </div>
        </motion.div>
      </article>

      <AnimatePresence>
        {expanded ? (
          <>
            <motion.button
              type="button"
              aria-label="Close preview"
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.06 }}
              onClick={() => setExpanded(false)}
            />
            <motion.div
              className="pointer-events-none fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden px-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-[max(1rem,env(safe-area-inset-top,0px))] sm:pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="relative mx-auto flex min-h-0 w-full max-w-[min(92rem,calc(100vw-1.5rem))] flex-1 flex-col pointer-events-none sm:max-w-[min(92rem,calc(100vw-2rem))]">
                <motion.div
                  layoutId={cardLayoutId}
                  transition={layoutTransition}
                  className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-zinc-200/80 bg-white shadow-2xl lg:flex-row dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <motion.div
                    className="order-2 flex w-full min-h-[min(52dvh,22rem)] shrink-0 flex-col overflow-y-auto overscroll-y-contain border-zinc-200/80 bg-white/96 px-5 py-5 backdrop-blur sm:px-6 lg:order-1 lg:min-h-0 lg:w-[min(420px,36vw)] lg:max-w-md lg:border-r dark:border-zinc-800 dark:bg-zinc-950/96"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ ...overlayTransition, delay: 0.06 }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                            Registry UI
                          </span>
                          {visibility === "private" ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              Private
                            </span>
                          ) : null}
                        </div>
                        <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-2xl dark:text-zinc-50">
                          {title}
                        </h2>
                        <p className="mt-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                          {owner} / {name}
                        </p>
                        {description ? (
                          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                            {description}
                          </p>
                        ) : null}
                      </div>
                      <div className="relative z-40 flex shrink-0 lg:hidden">
                        <Link
                          href={`/registry/${owner}/${name}`}
                          className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Open registry detail page"
                          title="Open detail page"
                        >
                          <HugeiconsIcon icon={ExpandIcon} strokeWidth={1.8} />
                        </Link>
                      </div>
                    </div>

                    {(detailData?.dependencies?.length ||
                      detailData?.registryDependencies?.length) ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Dependencies:
                        </span>
                        {detailData.dependencies.map((dep) => (
                          <span
                            key={dep}
                            className="rounded-md bg-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {dep}
                          </span>
                        ))}
                        {detailData.registryDependencies.map((ref) => (
                          <span
                            key={ref}
                            className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                          >
                            {ref.startsWith("@") ? ref : `@${ref}`}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {detailData?.previewStories?.length ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Story:
                        </span>
                        <select
                          aria-label="Select story"
                          value={selectedStoryId ?? ""}
                          onChange={(event) => {
                            const next = event.target.value.trim();
                            setSelectedStoryId(next.length > 0 ? next : null);
                          }}
                          className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {detailData.previewStories.map((story) => (
                            <option key={story.id} value={story.id}>
                              {story.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {detailData?.dependencyDiagnostics?.length ? (
                      <section className="mt-4 space-y-2">
                        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                          Preview dependency support
                        </h3>
                        <div className="flex flex-col gap-2">
                          {detailData.dependencyDiagnostics.map((decision) => (
                            <div
                              key={`${decision.packageName}:${decision.importSpecifier ?? ""}`}
                              className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                                  {getDependencyDisplayName(decision)}
                                </span>
                                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                  {decision.tier}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    decision.previewCapability === "prebundle-supported"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                      : decision.previewCapability === "runtime-only"
                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
                                  )}
                                >
                                  {decision.previewCapability}
                                </span>
                                {decision.requestedVersion ? (
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                                    v{decision.requestedVersion}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {decision.message}
                              </p>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <div className="mt-6 space-y-6 pb-2">
                      <section className="space-y-3">
                        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                          Use in your project
                        </h3>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                            shadcn CLI install
                          </p>
                          <code className="block break-all font-mono text-sm text-zinc-800 dark:text-zinc-200">
                            {installCommand}
                          </code>
                        </div>
                      </section>

                      {propsFromCode.length > 0 ? (
                        <section className="space-y-3">
                          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                            Props
                          </h3>
                          <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                                  <TableHead className="text-zinc-500 dark:text-zinc-400">
                                    Name
                                  </TableHead>
                                  <TableHead className="text-zinc-500 dark:text-zinc-400">
                                    Type
                                  </TableHead>
                                  <TableHead className="text-zinc-500 dark:text-zinc-400">
                                    Optional
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {propsFromCode.map((prop) => (
                                  <TableRow
                                    key={prop.name}
                                    className="border-zinc-100 dark:border-zinc-800"
                                  >
                                    <TableCell className="font-mono text-zinc-800 dark:text-zinc-200">
                                      {prop.name}
                                    </TableCell>
                                    <TableCell className="font-mono text-zinc-600 dark:text-zinc-400">
                                      {prop.type}
                                    </TableCell>
                                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                                      {prop.optional ? "Yes" : "—"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </section>
                      ) : null}
                    </div>
                  </motion.div>

                  <div className="order-1 flex w-full flex-1 flex-col overflow-hidden border-b border-zinc-200/80 bg-zinc-50/40 min-h-[min(42dvh,20rem)] sm:min-h-[min(44dvh,22rem)] lg:order-2 lg:min-h-0 lg:border-b-0 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div
                      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/90 bg-white/95 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/95"
                      role="tablist"
                      aria-label="Preview and code"
                    >
                      <div className="flex flex-1 flex-wrap items-center gap-1">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={expandedMainTab === "preview"}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                            expandedMainTab === "preview"
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                          )}
                          onClick={() => setExpandedMainTab("preview")}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={expandedMainTab === "code"}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                            expandedMainTab === "code"
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                          )}
                          onClick={() => setExpandedMainTab("code")}
                        >
                          Code
                        </button>
                      </div>
                      {versionOptions.length > 1 && versionMeta ? (
                        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:ml-auto">
                          <label
                            htmlFor={`card-expanded-version-${itemId}`}
                            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
                          >
                            Version
                          </label>
                          <select
                            id={`card-expanded-version-${itemId}`}
                            className="max-w-[min(220px,42vw)] rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            value={
                              selectedDetailVersion ?? versionMeta.currentVersion
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === versionMeta.currentVersion) {
                                setSelectedDetailVersion(null);
                              } else {
                                setSelectedDetailVersion(v);
                              }
                            }}
                            disabled={versionsLoading}
                          >
                            {versionOptions.map((ver) => (
                              <option key={ver} value={ver}>
                                v{ver}
                                {ver === versionMeta.currentVersion
                                  ? " (latest)"
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>

                    <div
                      className={cn(
                        "relative min-h-0 flex-1 bg-[linear-gradient(180deg,rgba(255,251,245,1),rgba(255,255,255,1))] dark:bg-[linear-gradient(180deg,rgba(39,39,42,0.7),rgba(9,9,11,0.2))]",
                        expandedMainTab !== "preview" && "hidden",
                      )}
                      role="tabpanel"
                      aria-hidden={expandedMainTab !== "preview"}
                    >
                      {artifactStatusLabel ? (
                        <div className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-col gap-2">
                          <span
                            className={cn(
                              "w-fit rounded-full px-3 py-1 text-xs font-medium shadow-sm",
                              artifactStatusTone,
                            )}
                          >
                            {artifactStatusLabel}
                          </span>
                          {artifactStatusMessage ? (
                            <p className="max-w-xl rounded-2xl bg-white/88 px-3 py-2 text-xs text-zinc-600 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-zinc-950/80 dark:text-zinc-300 dark:ring-white/10">
                              {artifactStatusMessage}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <PreviewFrame
                        ref={expandedPreviewRef}
                        key={`expanded-preview-${owner}-${name}-${vParam ?? "latest"}-${selectedStoryId ?? "default"}`}
                        src={previewSrc}
                        title={`${title} preview`}
                        className="h-full w-full min-h-[12rem] lg:min-h-0"
                        interactive
                        alignX="left"
                        alignY="top"
                        fitMode="actual"
                      />
                      {controllablePreviewFields.length > 0 ? (
                        <PreviewPropsDebugPanel
                          fields={controllablePreviewFields}
                          values={livePreviewProps}
                          onChange={handlePreviewPropChange}
                        />
                      ) : null}
                    </div>

                    <div
                      className={cn(
                        "flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950",
                        expandedMainTab !== "code" && "hidden",
                      )}
                      role="tabpanel"
                      aria-hidden={expandedMainTab !== "code"}
                    >
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,0.34fr)_minmax(0,0.66fr)] gap-0 overflow-hidden lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)] lg:grid-rows-1">
                          <div className="min-h-0 overflow-auto bg-zinc-50/70 p-1 dark:bg-zinc-900/35">
                            {isDetailPending ? (
                              <p className="px-1.5 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                Loading…
                              </p>
                            ) : detailData?.files?.length ? (
                              <RegistryFileTree
                                files={detailData.files}
                                selectedPath={selectedPath}
                                onSelectFile={setSelectedPath}
                              />
                            ) : (
                              <p className="px-1.5 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                No files to show
                              </p>
                            )}
                          </div>
                          <div className="min-h-[12rem] overflow-auto lg:min-h-0">
                            {isDetailPending ? (
                              <div className="flex min-h-[200px] items-center justify-center bg-[#0d1117] px-4 text-sm text-zinc-400">
                                Loading code…
                              </div>
                            ) : detailError ? (
                              <div className="flex min-h-[200px] items-center justify-center bg-[#0d1117] px-4 text-sm text-amber-400">
                                {detailError}
                              </div>
                            ) : (
                              <CodeBlock
                                key={preferredFile?.path ?? "source-unavailable"}
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
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
                {renderFloatingActionButtons()}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
