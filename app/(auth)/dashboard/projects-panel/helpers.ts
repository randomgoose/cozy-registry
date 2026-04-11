import { ArtboardToolIcon, ComponentIcon, PaintBoardIcon } from "@hugeicons/core-free-icons";
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
import type { ProjectItemDetailData, PreviewArtifactStatusPayload } from "./types";

/** Keep several preview iframes mounted so switching resources reuses loaded documents (no full remount / white flash). */
export const PREVIEW_WARM_SLOTS_MAX = 6;

export function parseThemeResourceRefsInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function formatThemeResourceRefsInput(refs: string[] | null | undefined): string {
  return (refs ?? []).join("\n");
}

export function buildArtifactDeliverySummary(
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

export function resolveSelectedPreviewStoryId(input: {
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

export function normalizeProjectItemDetailData(value: unknown): ProjectItemDetailData | null {
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

export function resolveProjectItemPreviewStories(input: {
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

export function isCodeFile(path: string): boolean {
  return /\.(tsx?|jsx?|css|json)$/i.test(path);
}

export function getProjectItemTypeIcon(type: string) {
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

export function getProjectPreviewSlotPlaceholderClass(type: string) {
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

export function getProjectFolderColor(visibility: "public" | "private" | null | undefined) {
  return visibility === "public" ? "#0F9B8E" : "#5B3DF5";
}
