import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

const ownerMocks = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
}));

vi.mock("@cozy/db", () => ({
  db: dbMocks,
}));

vi.mock("@cozy/registry-domain/owner", () => ({
  resolveOwner: ownerMocks.resolveOwner,
}));

import {
  createCollectionFromBody,
  listCollections,
} from "@cozy/platform-services/collections-service";

function makeSelectOrderChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
}

describe("collections-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when listing owned collections without a user", async () => {
    const result = await listCollections({
      context: { userId: null, activeTeamId: null },
    });

    expect(result).toEqual({
      status: 401,
      body: { error: "Authentication required (owner not specified)" },
    });
    expect(dbMocks.select).not.toHaveBeenCalled();
  });

  it("returns an empty list when a public owner handle cannot be resolved", async () => {
    ownerMocks.resolveOwner.mockResolvedValue(null);

    const result = await listCollections({
      context: { userId: "user-1", activeTeamId: null },
      owner: "missing-owner",
    });

    expect(result).toEqual({
      status: 200,
      body: { collections: [] },
    });
  });

  it("rejects invalid collection slugs before touching the database", async () => {
    const result = await createCollectionFromBody({
      context: { userId: "user-1", activeTeamId: null },
      body: {
        slug: "Not Valid",
        title: "Bad Slug",
      },
    });

    expect(result).toEqual({
      status: 400,
      body: { error: "slug must be kebab-case (e.g. marketing-blocks)" },
    });
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("maps duplicate-key failures to a 409 response", async () => {
    const values = vi
      .fn()
      .mockReturnValue({ returning: vi.fn().mockRejectedValue(new Error("duplicate key value violates unique constraint")) });
    dbMocks.insert.mockReturnValue({ values });

    const result = await createCollectionFromBody({
      context: { userId: "user-1", activeTeamId: null },
      body: {
        slug: "marketing-blocks",
        title: "Marketing Blocks",
      },
    });

    expect(result).toEqual({
      status: 409,
      body: { error: "Collection slug already exists" },
    });
  });

  it("returns owned collections with computed item counts", async () => {
    dbMocks.select
      .mockReturnValueOnce(
        makeSelectOrderChain([
          {
            id: "col-1",
            ownerUserId: "user-1",
            ownerTeamId: null,
            slug: "marketing",
            title: "Marketing",
            description: null,
            visibility: "private",
            createdAt: new Date("2026-03-27T00:00:00.000Z"),
            updatedAt: new Date("2026-03-27T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { collectionId: "col-1", itemId: "item-1" },
          { collectionId: "col-1", itemId: "item-2" },
        ]),
      });

    const result = await listCollections({
      context: { userId: "user-1", activeTeamId: null },
    });

    expect(result.status).toBe(200);
    const collections =
      "collections" in result.body && Array.isArray(result.body.collections)
        ? result.body.collections
        : [];
    expect(collections).toHaveLength(1);
    expect(collections[0]).toEqual(
      expect.objectContaining({
        id: "col-1",
        itemCount: 2,
      }),
    );
  });
});
