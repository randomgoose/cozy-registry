import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPreviewResolveCacheKey,
  clearPreviewResolveCache,
  getPreviewResolveCache,
  getPreviewResolveCacheSize,
  setPreviewResolveCache,
} from "@/lib/preview-resolve-cache";

describe("preview-resolve-cache", () => {
  beforeEach(() => {
    clearPreviewResolveCache();
    vi.useRealTimers();
  });

  it("builds a stable key from owner/project/name/version/user/deps", () => {
    const first = buildPreviewResolveCacheKey({
      owner: "alice",
      projectKey: "ds",
      name: "dialog",
      version: "1.2.0",
      requestUserId: "user-1",
      registryDependencies: ["@alice/ds/theme"],
    });
    const second = buildPreviewResolveCacheKey({
      owner: "alice",
      projectKey: "ds",
      name: "dialog",
      version: "1.2.0",
      requestUserId: "user-1",
      registryDependencies: ["@alice/ds/theme"],
    });

    expect(first).toBe(second);
  });

  it("changes the key when project-scoped theme dependencies differ", () => {
    const first = buildPreviewResolveCacheKey({
      owner: "alice",
      projectKey: "ds",
      name: "dialog",
      version: "1.2.0",
      requestUserId: "user-1",
      registryDependencies: ["@alice/ds/theme"],
    });
    const second = buildPreviewResolveCacheKey({
      owner: "alice",
      projectKey: "ds",
      name: "dialog",
      version: "1.2.0",
      requestUserId: "user-1",
      registryDependencies: ["@alice/marketing/theme"],
    });

    expect(first).not.toBe(second);
  });

  it("expires entries after ttl", () => {
    vi.useFakeTimers();
    const key = "resolve-key";
    setPreviewResolveCache(key, {
      files: { "index.tsx": "export default function Dialog() { return null; }" },
      componentDepSources: [],
      themeSources: [],
      themeCss: "",
      registryGraphHash: "sha256:graph",
      resolvedNodeCount: 1,
    });

    expect(getPreviewResolveCache(key)?.resolvedNodeCount).toBe(1);
    vi.advanceTimersByTime(30_001);
    expect(getPreviewResolveCache(key)).toBeNull();
  });

  it("keeps cache bounded", () => {
    for (let i = 0; i < 80; i += 1) {
      setPreviewResolveCache(`key-${i}`, {
        files: { "index.tsx": `export const n = ${i};` },
        componentDepSources: [],
        themeSources: [],
        themeCss: "",
        registryGraphHash: `sha256:${i}`,
        resolvedNodeCount: i,
      });
    }

    expect(getPreviewResolveCacheSize()).toBeLessThanOrEqual(64);
  });
});
