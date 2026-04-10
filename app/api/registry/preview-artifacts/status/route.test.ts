import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getUserIdFromTokenMock = vi.fn();
const getRegistryItemByScopedIdentityAndVersionMock = vi.fn();
const enqueuePreviewArtifactJobMock = vi.fn();
const selectMock = vi.fn();
const readDependencyDecisionsFromMetaMock = vi.fn();
const fetchMock = vi.fn();

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
  getCurrentVersion: (item: { currentVersion?: string | null }) =>
    item.currentVersion ?? "0.1.0",
  getRegistryItemByScopedIdentityAndVersion: getRegistryItemByScopedIdentityAndVersionMock,
}));

vi.mock("@/lib/preview-artifact-jobs", () => ({
  enqueuePreviewArtifactJob: enqueuePreviewArtifactJobMock,
  formatRuntimeOnlyDependencySkipMessage: () =>
    "Artifact prebundle was skipped by policy because one or more dependencies are runtime-only.",
  inferPreviewArtifactCapability: ({
    storedCapability,
  }: {
    storedCapability?: string | null;
  }) => storedCapability ?? "managed-artifact",
}));

vi.mock("@/lib/third-party-dependency-governance", () => ({
  readDependencyDecisionsFromMeta: readDependencyDecisionsFromMetaMock,
  getCompatibleArtifactDependencyDisplayNames: (decisions: Array<{ importSpecifier?: string; packageName: string; previewCapability: string }>) =>
    decisions
      .filter((decision) => decision.previewCapability === "compatible-artifact-supported")
      .map((decision) => decision.importSpecifier ?? decision.packageName),
}));

vi.mock("@/lib/project-resource-relationships", () => ({
  resolveThemeRelationshipForResource: vi.fn(async () => ({
    resolvedThemeResourceRefs: [],
    resolvedThemeLayerSources: [],
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
  },
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

describe("preview artifact status route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    getSessionMock.mockResolvedValue(null);
    getUserIdFromTokenMock.mockResolvedValue(null);
    getRegistryItemByScopedIdentityAndVersionMock.mockResolvedValue({
      id: "item-1",
      type: "registry:ui",
      currentVersion: "1.2.3",
      meta: null,
    });
    readDependencyDecisionsFromMetaMock.mockReturnValue([]);
  });

  it("enqueues and returns queued when artifact is missing and enqueue=1", async () => {
    getRegistryItemByScopedIdentityAndVersionMock.mockResolvedValue({
      id: "item-1",
      type: "registry:ui",
      currentVersion: "1.2.3",
      meta: {
        previewStories: [{ id: "default", title: "Default" }],
        previewDefaultStoryId: "default",
      },
    });
    createSelectChain([[{ id: "version-1" }], []]);

    const { GET } = await import("@/app/api/registry/preview-artifacts/status/route");
    const response = await GET(
      new Request(
        "http://localhost/api/registry/preview-artifacts/status?owner=indeed-cozy&name=button&story=default&enqueue=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(enqueuePreviewArtifactJobMock).toHaveBeenCalledWith({
      itemId: "item-1",
      itemVersionId: "version-1",
      payload: {
        owner: "indeed-cozy",
        project: null,
        name: "button",
        version: "1.2.3",
        mode: "default",
        storyId: "default",
        requestUserId: null,
      },
    });

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        artifactStatus: "queued",
        owner: "indeed-cozy",
        name: "button",
        version: "1.2.3",
        storyId: "default",
      }),
    );
  }, 10000);

  it("returns missing without enqueue side effects when enqueue=1 is absent", async () => {
    createSelectChain([[{ id: "version-1" }], []]);

    const { GET } = await import("@/app/api/registry/preview-artifacts/status/route");
    const response = await GET(
      new Request(
        "http://localhost/api/registry/preview-artifacts/status?owner=indeed-cozy&name=button",
      ),
    );

    expect(response.status).toBe(200);
    expect(enqueuePreviewArtifactJobMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        artifactStatus: "missing",
        owner: "indeed-cozy",
        name: "button",
        version: "1.2.3",
      }),
    );
  }, 10000);

  it("returns compatible external dependency names for compatible artifacts", async () => {
    getRegistryItemByScopedIdentityAndVersionMock.mockResolvedValue({
      id: "item-1",
      type: "registry:ui",
      currentVersion: "1.2.3",
      meta: {},
    });
    readDependencyDecisionsFromMetaMock.mockReturnValue([
      {
        importSpecifier: "recharts",
        packageName: "recharts",
        previewCapability: "compatible-artifact-supported",
      },
    ]);
    createSelectChain([
      [{ id: "version-1" }],
      [
        {
          status: "ready",
          artifactCapability: "compatible-artifact",
          artifactKey: "artifact-1",
          jsUrl: "https://cdn.example.com/preview.js",
          cssUrl: null,
          manifestUrl: "https://cdn.example.com/manifest.json",
          startedAt: null,
          finishedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      ],
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        hostFallbackUsed: false,
        managedProviderDependencies: ["lucide-react"],
        compatibleBundledDependencies: ["recharts"],
      }),
    });

    const { GET } = await import("@/app/api/registry/preview-artifacts/status/route");
    const response = await GET(
      new Request(
        "http://localhost/api/registry/preview-artifacts/status?owner=indeed-cozy&name=chart",
      ),
    );

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        artifactStatus: "ready",
        artifactCapability: "compatible-artifact",
        compatibleExternalDependencies: ["recharts"],
        hostFallbackUsed: false,
        managedProviderDependencies: ["lucide-react"],
        compatibleBundledDependencies: ["recharts"],
      }),
    );
  });
});
