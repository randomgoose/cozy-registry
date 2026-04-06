type PreviewResolvedArtifacts = {
  files: Record<string, string>;
  componentDepSources: string[];
  themeSources: string[];
  themeCss: string;
  registryGraphHash: string;
  resolvedNodeCount: number;
};

type PreviewResolvedCacheEntry = {
  value: PreviewResolvedArtifacts;
  expiresAt: number;
};

const PREVIEW_RESOLVE_CACHE_TTL_MS = 30_000;
const PREVIEW_RESOLVE_CACHE_LIMIT = 64;
const previewResolveCache = new Map<string, PreviewResolvedCacheEntry>();

export function buildPreviewResolveCacheKey(input: {
  owner: string;
  projectKey?: string | null;
  name: string;
  version: string;
  requestUserId: string | null;
  registryDependencies?: string[] | null;
}) {
  return JSON.stringify([
    input.owner,
    input.projectKey ?? "",
    input.name,
    input.version,
    input.requestUserId ?? "",
    Array.isArray(input.registryDependencies)
      ? [...input.registryDependencies].sort()
      : [],
  ]);
}

export function getPreviewResolveCache(
  key: string,
): PreviewResolvedArtifacts | null {
  const now = Date.now();
  const hit = previewResolveCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    previewResolveCache.delete(key);
    return null;
  }

  previewResolveCache.delete(key);
  previewResolveCache.set(key, hit);
  return hit.value;
}

export function setPreviewResolveCache(
  key: string,
  value: PreviewResolvedArtifacts,
) {
  if (previewResolveCache.has(key)) {
    previewResolveCache.delete(key);
  }

  previewResolveCache.set(key, {
    value,
    expiresAt: Date.now() + PREVIEW_RESOLVE_CACHE_TTL_MS,
  });

  while (previewResolveCache.size > PREVIEW_RESOLVE_CACHE_LIMIT) {
    const oldestKey = previewResolveCache.keys().next().value;
    if (!oldestKey) break;
    previewResolveCache.delete(oldestKey);
  }
}

export function clearPreviewResolveCache() {
  previewResolveCache.clear();
}

export function getPreviewResolveCacheSize() {
  return previewResolveCache.size;
}
