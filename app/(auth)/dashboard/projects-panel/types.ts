import type { ProjectListItem } from "@/lib/project-list";
import type { PreviewStory } from "@/lib/preview-stories";

/** Project row in lists — alias of registry project list DTO. */
export type Project = ProjectListItem;

export type CreatedProject = { id: string; slug: string; title: string };

export type MemberRow = { userId: string; role: string; name: string | null; email: string };

export type ProjectItemDetailData = {
  type: string;
  dependencies: string[];
  registryDependencies: string[];
  previewStories: PreviewStory[];
  previewDefaultStoryId: string | null;
  files: { path: string; content: string; type: string }[];
};

export type PreviewArtifactStatus =
  | "missing"
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "skipped";

export type PreviewArtifactCapability =
  | "managed-artifact"
  | "compatible-artifact"
  | "runtime-only";

export type PreviewArtifactStatusPayload = {
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

/** Warm-iframe slot for project resource previews. */
export type WarmPreviewSlot = {
  itemId: string;
  projectKey: string | null;
  name: string;
  title: string;
};
