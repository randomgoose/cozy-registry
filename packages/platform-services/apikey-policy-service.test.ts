import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@cozy/db", () => ({
  db: dbMocks,
}));

import {
  getRegistryApiKeyPolicy,
  putRegistryApiKeyPolicy,
} from "@cozy/platform-services/apikey-policy-service";

function makeSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe("apikey-policy-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when reading without an authenticated user", async () => {
    const result = await getRegistryApiKeyPolicy({
      context: { userId: null, activeTeamId: null },
      apiKeyId: "key-1",
    });

    expect(result).toEqual({
      status: 401,
      body: { error: "Authentication required" },
    });
    expect(dbMocks.select).not.toHaveBeenCalled();
  });

  it("normalizes policy arrays and writes a team-scoped record on create", async () => {
    dbMocks.select
      .mockReturnValueOnce(
        makeSelectChain([{ id: "key-1", referenceId: "user-1" }]),
      )
      .mockReturnValueOnce(makeSelectChain([]));

    const returning = vi.fn().mockResolvedValue([
      {
        apiKeyId: "key-1",
        ownerUserId: null,
        ownerTeamId: "team-1",
        allowedCollectionIds: ["col-1", "col-2"],
        allowedTypes: ["registry:block"],
        allowedOwnerHandlesOrIds: ["acme"],
        allowPublicOutsideCollections: true,
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    dbMocks.insert.mockReturnValue({ values });

    const result = await putRegistryApiKeyPolicy({
      context: { userId: "user-1", activeTeamId: "team-1" },
      apiKeyId: "key-1",
      body: {
        allowedCollectionIds: ["col-1", "", "col-2"],
        allowedTypes: ["registry:block", ""],
        allowedOwnerHandlesOrIds: ["acme", ""],
        allowPublicOutsideCollections: true,
      },
    });

    expect(values).toHaveBeenCalledWith({
      apiKeyId: "key-1",
      ownerUserId: null,
      ownerTeamId: "team-1",
      allowedCollectionIds: ["col-1", "col-2"],
      allowedTypes: ["registry:block"],
      allowedOwnerHandlesOrIds: ["acme"],
      allowPublicOutsideCollections: true,
    });
    expect(result).toEqual({
      status: 200,
      body: {
        policy: {
          apiKeyId: "key-1",
          ownerUserId: null,
          ownerTeamId: "team-1",
          allowedCollectionIds: ["col-1", "col-2"],
          allowedTypes: ["registry:block"],
          allowedOwnerHandlesOrIds: ["acme"],
          allowPublicOutsideCollections: true,
        },
      },
    });
  });

  it("updates an existing policy instead of inserting a new one", async () => {
    dbMocks.select
      .mockReturnValueOnce(
        makeSelectChain([{ id: "key-1", referenceId: "user-1" }]),
      )
      .mockReturnValueOnce(makeSelectChain([{ apiKeyId: "key-1" }]));

    const returning = vi.fn().mockResolvedValue([
      {
        apiKeyId: "key-1",
        ownerUserId: "user-1",
        ownerTeamId: null,
        allowedCollectionIds: [],
        allowedTypes: ["registry:theme"],
        allowedOwnerHandlesOrIds: [],
        allowPublicOutsideCollections: false,
      },
    ]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    dbMocks.update.mockReturnValue({ set });

    const result = await putRegistryApiKeyPolicy({
      context: { userId: "user-1", activeTeamId: null },
      apiKeyId: "key-1",
      body: {
        allowedTypes: ["registry:theme"],
      },
    });

    expect(dbMocks.insert).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTypes: ["registry:theme"],
        allowPublicOutsideCollections: false,
      }),
    );
    expect(result.status).toBe(200);
    expect(result.body.policy?.ownerUserId).toBe("user-1");
  });
});
