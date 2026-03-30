import { createHash } from "node:crypto";

type PreviewCacheKeyInput = {
  owner: string;
  name: string;
  version: string;
  mode: "default" | "thumbnail";
  debug: boolean;
  rootFilesHash: string;
  previewExport: string | null;
  previewPropsHash: string;
  runtimeDepsHash: string;
  registryGraphHash: string;
};

type PreviewWorkspaceKeyInput = Omit<PreviewCacheKeyInput, "previewPropsHash">;

export type PreviewBuildCacheEntry = {
  build: {
    code: string;
    css?: string;
  };
  themeCss: string;
  themeSources: string[];
  componentDepSources: string[];
  cacheKeySummary: PreviewCacheKeyInput;
};

const PREVIEW_BUILD_CACHE_LIMIT = 64;
const previewBuildCache = new Map<string, PreviewBuildCacheEntry>();

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

export function hashFiles(files: Record<string, string>): string {
  const normalized = Object.keys(files)
    .sort()
    .map((filePath) => [filePath, files[filePath] ?? ""]);
  return sha256(stableStringify(normalized));
}

export function buildPreviewCacheKey(input: PreviewCacheKeyInput) {
  return sha256(stableStringify(input));
}

export function buildPreviewWorkspaceKey(input: PreviewWorkspaceKeyInput) {
  return sha256(stableStringify(input));
}

export function getPreviewBuildCache(key: string): PreviewBuildCacheEntry | null {
  const hit = previewBuildCache.get(key);
  if (!hit) return null;

  previewBuildCache.delete(key);
  previewBuildCache.set(key, hit);
  return hit;
}

export function setPreviewBuildCache(key: string, entry: PreviewBuildCacheEntry) {
  if (previewBuildCache.has(key)) {
    previewBuildCache.delete(key);
  }
  previewBuildCache.set(key, entry);

  while (previewBuildCache.size > PREVIEW_BUILD_CACHE_LIMIT) {
    const oldestKey = previewBuildCache.keys().next().value;
    if (!oldestKey) break;
    previewBuildCache.delete(oldestKey);
  }
}

export function clearPreviewBuildCache() {
  previewBuildCache.clear();
}

export function getPreviewBuildCacheSize() {
  return previewBuildCache.size;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }
  return value;
}
