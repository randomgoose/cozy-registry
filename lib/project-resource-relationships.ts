import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import { getRegistryProjectByOwnerAndNamespace } from "@/lib/registry";

export type ResolvedThemeSource =
  | "resource-override"
  | "project-default"
  | "none";

export type ResolvedThemeRelationship = {
  resolvedThemeResourceRef: string | null;
  resolvedThemeSource: ResolvedThemeSource;
};

function normalizeRegistryRef(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return parseRegistryDependencyRef(trimmed) ? trimmed : null;
}

export function readResourceThemeOverride(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).themeResourceRef;
  return typeof raw === "string" ? normalizeRegistryRef(raw) : null;
}

export async function resolveThemeRelationshipForResource(params: {
  owner: string;
  projectKey?: string | null;
  meta: unknown;
  requestUserId?: string | null;
}): Promise<ResolvedThemeRelationship> {
  const resourceOverride = readResourceThemeOverride(params.meta);
  if (resourceOverride) {
    return {
      resolvedThemeResourceRef: resourceOverride,
      resolvedThemeSource: "resource-override",
    };
  }

  const projectKey = params.projectKey?.trim() || null;
  if (!projectKey) {
    return {
      resolvedThemeResourceRef: null,
      resolvedThemeSource: "none",
    };
  }

  const project = await getRegistryProjectByOwnerAndNamespace(
    params.owner,
    projectKey,
    params.requestUserId,
  );
  const projectDefault = normalizeRegistryRef(project?.defaultThemeResourceRef ?? null);
  if (projectDefault) {
    return {
      resolvedThemeResourceRef: projectDefault,
      resolvedThemeSource: "project-default",
    };
  }

  return {
    resolvedThemeResourceRef: null,
    resolvedThemeSource: "none",
  };
}

export function mergeRegistryDependenciesWithResolvedTheme(
  registryDependencies: string[] | null | undefined,
  resolvedThemeResourceRef: string | null,
) {
  const merged = new Set(
    Array.isArray(registryDependencies)
      ? registryDependencies
          .filter((dep): dep is string => typeof dep === "string")
          .map((dep) => dep.trim())
          .filter(Boolean)
      : [],
  );
  if (resolvedThemeResourceRef) {
    merged.add(resolvedThemeResourceRef);
  }
  return Array.from(merged);
}
