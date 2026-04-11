import type { PreviewStory } from "@/lib/preview-stories";
import type { DeclaredThirdPartyDependency } from "@/lib/third-party-dependency-input";

export type RegistryResourcePayload = {
  type: string;
  title: string;
  description: string | null;
  files: Record<string, string>;
  registryDependencies: string[];
  declaredDependencies: DeclaredThirdPartyDependency[];
  previewProps?: unknown;
  previewExport?: string | null;
  previewStories?: PreviewStory[];
  previewDefaultStoryId?: string | null;
};
