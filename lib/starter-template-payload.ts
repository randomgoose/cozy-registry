import type { RegistryResourcePayload } from "@/lib/registry-resource-payload";
import type { StarterTemplateManifest } from "@/lib/starter-template-format";

export function buildRegistryResourcePayloadFromStarterTemplate(input: {
  manifest: StarterTemplateManifest;
  bundleFiles: Record<string, string>;
  registryDependencies: string[];
}): RegistryResourcePayload {
  return {
    type: input.manifest.resourceType,
    title: input.manifest.title,
    description: input.manifest.description || null,
    files: input.bundleFiles,
    registryDependencies: input.registryDependencies,
    declaredDependencies: input.manifest.declaredDependencies,
    ...(input.manifest.previewProps !== undefined
      ? { previewProps: input.manifest.previewProps }
      : {}),
    ...(input.manifest.previewExport !== undefined
      ? { previewExport: input.manifest.previewExport }
      : {}),
    ...(input.manifest.previewStories.length > 0
      ? { previewStories: input.manifest.previewStories }
      : {}),
    ...(input.manifest.previewDefaultStoryId !== undefined
      ? { previewDefaultStoryId: input.manifest.previewDefaultStoryId }
      : {}),
  };
}
