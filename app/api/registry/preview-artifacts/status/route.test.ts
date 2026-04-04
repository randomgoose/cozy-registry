import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getUserIdFromTokenMock = vi.fn();
const getRegistryItemByScopedIdentityAndVersionMock = vi.fn();
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
  getCurrentVersion: (item: { currentVersion?: string | null }) =>
    item.currentVersion ?? "0.1.0",
  getRegistryItemByScopedIdentityAndVersion: getRegistryItemByScopedIdentityAndVersionMock,
}));

vi.mock("@/lib/preview-artifact-jobs", () => ({
  enqueuePreviewArtifactJob: enqueuePreviewArtifactJobMock,
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
    getSessionMock.mockResolvedValue(null);
    getUserIdFromTokenMock.mockResolvedValue(null);
    getRegistryItemByScopedIdentityAndVersionMock.mockResolvedValue({
      id: "item-1",
      type: "registry:ui",
      currentVersion: "1.2.3",
    });
  });

  it("enqueues and returns queued when artifact is missing and enqueue=1", async () => {
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
  });

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
  });
});
