import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getUserIdFromTokenMock = vi.fn();
const getRegistryItemByScopedIdentityAndVersionMock = vi.fn();
const getRegistryItemVersionsScopedMock = vi.fn();
const enqueuePreviewArtifactJobMock = vi.fn();
const selectMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/auth-api", () => ({
  getUserIdFromToken: getUserIdFromTokenMock,
}));

vi.mock("@/lib/registry", () => ({
  getRegistryItemByScopedIdentityAndVersion: getRegistryItemByScopedIdentityAndVersionMock,
  getRegistryItemVersionsScoped: getRegistryItemVersionsScopedMock,
  getCurrentVersion: (item: { currentVersion?: string | null }) =>
    item.currentVersion ?? "0.1.0",
  toShadcnRegistryItem: vi.fn(),
  getThemeEntryCss: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("@/lib/preview-artifact-jobs", () => ({
  enqueuePreviewArtifactJob: enqueuePreviewArtifactJobMock,
}));

vi.mock("@/lib/preview-build", () => ({
  buildPreviewBundle: vi.fn(),
}));

vi.mock("@/lib/preview-build-cache", () => ({
  buildPreviewCacheKey: vi.fn(() => "cache-key"),
  buildPreviewWorkspaceKey: vi.fn(() => "workspace-key"),
  getPreviewBuildCache: vi.fn(() => null),
  hashFiles: vi.fn(() => "files-hash"),
  setPreviewBuildCache: vi.fn(),
  sha256: vi.fn(() => "sha256:test"),
  stableStringify: vi.fn((value: unknown) => JSON.stringify(value)),
}));

vi.mock("@/lib/preview-resolve-cache", () => ({
  buildPreviewResolveCacheKey: vi.fn(() => "resolve-cache-key"),
  getPreviewResolveCache: vi.fn(() => null),
  setPreviewResolveCache: vi.fn(),
}));

vi.mock("@/lib/validate-tsx", () => ({
  extractDependencies: vi.fn(() => []),
}));

vi.mock("@/lib/registry-resolver", () => ({
  collectThemeCssFromResolvedGraph: vi.fn(() => ({ css: "", sources: [] })),
  createRegistryResolverMemo: vi.fn(() => ({})),
  resolveRegistryDependencies: vi.fn(),
}));

vi.mock("@/lib/registry-install-layout", () => ({
  materializeInstalledRegistryFilesFromResolvedGraph: vi.fn(),
}));

vi.mock("@/lib/preview-stories", () => ({
  pickPreviewStory: vi.fn(() => ({ selectedStory: null, stories: [] })),
}));

vi.mock("@/lib/third-party-dependency-governance", () => ({
  evaluateThirdPartyDependencies: vi.fn(() => []),
  excludeExplicitRegistryDependencies: vi.fn((deps: string[]) => deps),
  getRejectedDependencyDecisions: vi.fn(() => []),
  getRuntimePreviewDependencies: vi.fn(() => []),
  readDeclaredThirdPartyDependenciesFromMeta: vi.fn(() => []),
}));

function createSelectChain(rows: unknown[]) {
  let index = 0;
  selectMock.mockImplementation(() => ({
    from() {
      return {
        where() {
          return {
            limit() {
              const value = rows[index] ?? [];
              index += 1;
              return Promise.resolve(value);
            },
          };
        },
      };
    },
  }));
}

describe("preview route state pages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(null);
    getUserIdFromTokenMock.mockResolvedValue(null);
    getRegistryItemVersionsScopedMock.mockResolvedValue([]);
    getRegistryItemByScopedIdentityAndVersionMock.mockResolvedValue({
      id: "item-1",
      name: "button",
      title: "Button",
      type: "registry:ui",
      currentVersion: "1.2.3",
      dependencies: [],
      registryDependencies: [],
      files: [],
      meta: {},
    });
  });

  it("returns a preparing page and enqueues when the story artifact is missing", async () => {
    createSelectChain([[{ id: "version-1" }], []]);

    const { GET } = await import("@/app/preview/[owner]/[name]/route");
    const response = await GET(new Request("http://localhost/preview/indeed-cozy/button"), {
      params: Promise.resolve({ owner: "indeed-cozy", name: "button" }),
    });

    expect(response.status).toBe(200);
    expect(enqueuePreviewArtifactJobMock).toHaveBeenCalledTimes(1);
    const html = await response.text();
    expect(html).toContain("Preparing preview");
    expect(html).toContain("currently building");
  });

  it("returns a runtime-only page when the artifact is skipped", async () => {
    createSelectChain([
      [{ id: "version-1" }],
      [
        {
          status: "skipped",
          jsUrl: null,
          cssUrl: null,
          lastErrorMessage: "Skipped by policy.",
        },
      ],
    ]);

    const { GET } = await import("@/app/preview/[owner]/[name]/route");
    const response = await GET(new Request("http://localhost/preview/indeed-cozy/button"), {
      params: Promise.resolve({ owner: "indeed-cozy", name: "button" }),
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Runtime preview only");
    expect(html).toContain("Skipped by policy.");
  });

  it("returns an error page when the artifact failed", async () => {
    createSelectChain([
      [{ id: "version-1" }],
      [
        {
          status: "failed",
          jsUrl: null,
          cssUrl: null,
          lastErrorMessage: "Artifact build exploded.",
        },
      ],
    ]);

    const { GET } = await import("@/app/preview/[owner]/[name]/route");
    const response = await GET(new Request("http://localhost/preview/indeed-cozy/button"), {
      params: Promise.resolve({ owner: "indeed-cozy", name: "button" }),
    });

    expect(response.status).toBe(500);
    const html = await response.text();
    expect(html).toContain("Preview artifact failed");
    expect(html).toContain("Artifact build exploded.");
  });
});
