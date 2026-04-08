import type { RegistryProjectRow } from "@/lib/project-permissions";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import { getRegistryProjectByOwnerAndNamespace } from "@/lib/registry";

export type ResolvedThemeLayerSource = "resource-layer" | "project-default";

export type ResolvedThemeRelationship = {
  resolvedThemeResourceRefs: string[];
  resolvedThemeLayerSources: ResolvedThemeLayerSource[];
};

function normalizeRegistryRef(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return parseRegistryDependencyRef(trimmed) ? trimmed : null;
}

export function normalizeThemeResourceRefsInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === "string" ? normalizeRegistryRef(entry) : null))
      .filter((entry): entry is string => !!entry);
    return [...new Set(normalized)];
  }
  const single = typeof value === "string" ? normalizeRegistryRef(value) : null;
  return single ? [single] : [];
}

export function readResourceThemeLayers(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const record = meta as Record<string, unknown>;
  const layered = normalizeThemeResourceRefsInput(record.themeResourceRefs);
  if (layered.length > 0) return layered;
  return normalizeThemeResourceRefsInput(record.themeResourceRef);
}

export function readProjectDefaultThemeLayers(
  project: Pick<
    RegistryProjectRow,
    "defaultThemeResourceRef" | "defaultThemeResourceRefs"
  > | null,
): string[] {
  const layered = normalizeThemeResourceRefsInput(project?.defaultThemeResourceRefs);
  if (layered.length > 0) return layered;
  return normalizeThemeResourceRefsInput(project?.defaultThemeResourceRef);
}

export function mergeThemeLayers(params: {
  projectThemeResourceRefs: string[];
  resourceThemeResourceRefs: string[];
}): ResolvedThemeRelationship {
  const refs: string[] = [];
  const sources: ResolvedThemeLayerSource[] = [];
  const seen = new Set<string>();

  for (const ref of params.projectThemeResourceRefs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
    sources.push("project-default");
  }

  for (const ref of params.resourceThemeResourceRefs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
    sources.push("resource-layer");
  }

  return {
    resolvedThemeResourceRefs: refs,
    resolvedThemeLayerSources: sources,
  };
}

export async function resolveThemeRelationshipForResource(params: {
  owner: string;
  projectKey?: string | null;
  meta: unknown;
  requestUserId?: string | null;
}): Promise<ResolvedThemeRelationship> {
  const resourceLayers = readResourceThemeLayers(params.meta);
  const projectKey = params.projectKey?.trim() || null;
  if (!projectKey) {
    return mergeThemeLayers({
      projectThemeResourceRefs: [],
      resourceThemeResourceRefs: resourceLayers,
    });
  }

  const project = await getRegistryProjectByOwnerAndNamespace(
    params.owner,
    projectKey,
    params.requestUserId,
  );

  return mergeThemeLayers({
    projectThemeResourceRefs: readProjectDefaultThemeLayers(project),
    resourceThemeResourceRefs: resourceLayers,
  });
}

export function mergeRegistryDependenciesWithResolvedThemes(
  registryDependencies: string[] | null | undefined,
  resolvedThemeResourceRefs: string[],
) {
  const merged = new Set(
    Array.isArray(registryDependencies)
      ? registryDependencies
          .filter((dep): dep is string => typeof dep === "string")
          .map((dep) => dep.trim())
          .filter(Boolean)
      : [],
  );
  for (const ref of resolvedThemeResourceRefs) {
    merged.add(ref);
  }
  return Array.from(merged);
}
