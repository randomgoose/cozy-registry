import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPreviewCacheKey,
  clearPreviewBuildCache,
  getPreviewBuildCache,
  getPreviewBuildCacheSize,
  hashFiles,
  setPreviewBuildCache,
  stableStringify,
} from "@/lib/preview-build-cache";

describe("preview-build-cache", () => {
  beforeEach(() => {
    clearPreviewBuildCache();
  });

  it("stableStringify sorts object keys deeply", () => {
    const a = {
      z: 1,
      nested: {
        b: true,
        a: "x",
      },
    };
    const b = {
      nested: {
        a: "x",
        b: true,
      },
      z: 1,
    };

    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("hashFiles is insensitive to object key insertion order", () => {
    const first = {
      "b.ts": "export const b = 2;",
      "a.ts": "export const a = 1;",
    };
    const second = {
      "a.ts": "export const a = 1;",
      "b.ts": "export const b = 2;",
    };

    expect(hashFiles(first)).toBe(hashFiles(second));
  });

  it("buildPreviewCacheKey changes when relevant preview inputs change", () => {
    const base = {
      owner: "alice",
      name: "dialog",
      version: "1.2.0",
      mode: "default" as const,
      rootFilesHash: "sha256:root",
      previewExport: "Dialog",
      previewPropsHash: "sha256:props-a",
      runtimeDepsHash: "sha256:deps",
      registryGraphHash: "sha256:graph",
    };

    const first = buildPreviewCacheKey(base);
    const second = buildPreviewCacheKey({
      ...base,
      previewPropsHash: "sha256:props-b",
    });

    expect(first).not.toBe(second);
  });

  it("keeps most recently used entries", () => {
    const makeEntry = (i: number) => ({
      build: { code: `code-${i}` },
      themeCss: "",
      themeSources: [],
      componentDepSources: [],
      cacheKeySummary: {
        owner: "alice",
        name: `comp-${i}`,
        version: "1.0.0",
        mode: "default" as const,
        rootFilesHash: `sha256:root-${i}`,
        previewExport: null,
        previewPropsHash: `sha256:props-${i}`,
        runtimeDepsHash: `sha256:deps-${i}`,
        registryGraphHash: `sha256:graph-${i}`,
      },
    });

    for (let i = 0; i < 64; i += 1) {
      setPreviewBuildCache(`key-${i}`, makeEntry(i));
    }

    expect(getPreviewBuildCacheSize()).toBe(64);
    expect(getPreviewBuildCache("key-0")?.build.code).toBe("code-0");

    setPreviewBuildCache("key-64", makeEntry(64));

    expect(getPreviewBuildCacheSize()).toBe(64);
    expect(getPreviewBuildCache("key-1")).toBeNull();
    expect(getPreviewBuildCache("key-0")?.build.code).toBe("code-0");
    expect(getPreviewBuildCache("key-64")?.build.code).toBe("code-64");
  });
});
