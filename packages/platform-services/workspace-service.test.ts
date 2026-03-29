import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@cozy/db", () => ({
  db: dbMocks,
}));

import { getCurrentWorkspace } from "@cozy/platform-services/workspace-service";

function makeLimitChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function makeOrderChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
}

function makeLeftJoinOrderChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
}

function makeInnerJoinOrderChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
}

describe("workspace-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated user", async () => {
    const result = await getCurrentWorkspace({
      context: { userId: null, activeOrganizationId: null },
    });

    expect(result).toEqual({
      status: 401,
      body: { error: "Authentication required" },
    });
  });

  it("returns an empty workspace payload when no active organization is selected", async () => {
    const result = await getCurrentWorkspace({
      context: { userId: "user-1", activeOrganizationId: null },
    });

    expect(result).toEqual({
      status: 200,
      body: {
        activeOrganizationId: null,
        role: null,
        workspace: null,
        teams: [],
        members: [],
        invitations: [],
      },
    });
    expect(dbMocks.select).not.toHaveBeenCalled();
  });

  it("hydrates workspace, teams, members, and invitations for the active organization", async () => {
    dbMocks.select
      .mockReturnValueOnce(
        makeLimitChain([{ role: "owner" }]),
      )
      .mockReturnValueOnce(
        makeLimitChain([
          {
            id: "org-1",
            name: "Acme",
            slug: "acme",
            createdAt: new Date("2026-03-27T00:00:00.000Z"),
            logo: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        makeOrderChain([
          {
            id: "team-1",
            name: "Design",
            slug: "design",
            createdAt: new Date("2026-03-27T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(
        makeInnerJoinOrderChain([
          {
            memberId: "mem-1",
            id: "user-1",
            name: "Casey",
            email: "casey@example.com",
            role: "owner",
            image: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        makeLeftJoinOrderChain([
          {
            id: "inv-1",
            email: "new@example.com",
            role: "viewer",
            status: "pending",
            teamId: "team-1",
            teamName: "Design",
            createdAt: new Date("2026-03-27T00:00:00.000Z"),
            expiresAt: new Date("2026-04-03T00:00:00.000Z"),
          },
        ]),
      );

    const result = await getCurrentWorkspace({
      context: { userId: "user-1", activeOrganizationId: "org-1" },
    });

    expect(result.status).toBe(200);
    expect(result.body.activeOrganizationId).toBe("org-1");
    expect(result.body.role).toBe("owner");
    expect(result.body.workspace).toEqual(
      expect.objectContaining({
        id: "org-1",
        slug: "acme",
      }),
    );
    expect(result.body.teams).toHaveLength(1);
    expect(result.body.members).toHaveLength(1);
    expect(result.body.invitations).toHaveLength(1);
  });
});
