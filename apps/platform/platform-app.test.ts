import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  health: vi.fn(async () => Response.json({ ok: true })),
  mcp: vi.fn(async () => Response.json({ ok: true })),
  mcpOptions: vi.fn(async () => new Response(null, { status: 204 })),
  preview: vi.fn(async () => Response.json({ preview: true })),
  registryCatalog: vi.fn(async () => Response.json({ route: "registry" })),
  registryItemDetail: vi.fn(async () => Response.json({ route: "registry-item" })),
  registryItemVersions: vi.fn(async () =>
    Response.json({ route: "registry-versions" }),
  ),
  registryItemsCreate: vi.fn(async () =>
    Response.json({ route: "registry-create" }),
  ),
  registryLookup: vi.fn(async () => Response.json({ route: "registry-lookup" })),
  registryOwned: vi.fn(async () => Response.json({ route: "registry-owned" })),
  registryConsumption: vi.fn(async () =>
    Response.json({ route: "registry-consumption" }),
  ),
  collections: vi.fn(async () => Response.json({ route: "collections" })),
  collectionDetail: vi.fn(async () =>
    Response.json({ route: "collection-detail" }),
  ),
  collectionItems: vi.fn(async () =>
    Response.json({ route: "collection-items" }),
  ),
  collectionItemDetail: vi.fn(async () =>
    Response.json({ route: "collection-item-detail" }),
  ),
  projects: vi.fn(async () => Response.json({ route: "projects" })),
  projectDetail: vi.fn(async () =>
    Response.json({ route: "project-detail" }),
  ),
  projectItems: vi.fn(async () =>
    Response.json({ route: "project-items" }),
  ),
  projectMembers: vi.fn(async () =>
    Response.json({ route: "project-members" }),
  ),
  projectMemberDetail: vi.fn(async () =>
    Response.json({ route: "project-member-detail" }),
  ),
  projectInvitationDetail: vi.fn(async () =>
    Response.json({ route: "project-invitation-detail" }),
  ),
  projectItemDetail: vi.fn(async () =>
    Response.json({ route: "project-item-detail" }),
  ),
  notifications: vi.fn(async () => Response.json({ route: "notifications" })),
  notificationDetail: vi.fn(async () =>
    Response.json({ route: "notification-detail" }),
  ),
  notificationsMarkAllRead: vi.fn(async () =>
    Response.json({ route: "notifications-mark-all-read" }),
  ),
  workspaceCurrent: vi.fn(async () => Response.json({ route: "workspace" })),
  teamCurrentCollaboration: vi.fn(async () =>
    Response.json({ route: "team-collaboration" }),
  ),
  apiKeyPolicy: vi.fn(async () => Response.json({ route: "apikey-policy" })),
}));

vi.mock("@/apps/platform/routes/health", () => ({
  handlePlatformHealthRoute: routeMocks.health,
}));

vi.mock("@/apps/platform/routes/mcp", () => ({
  handlePlatformMcpRoute: routeMocks.mcp,
  handlePlatformMcpOptionsRoute: routeMocks.mcpOptions,
}));

vi.mock("@/apps/platform/routes/preview", () => ({
  handlePlatformPreviewRoute: routeMocks.preview,
}));

vi.mock("@/apps/platform/routes/registry", () => ({
  handlePlatformRegistryCatalogRoute: routeMocks.registryCatalog,
  handlePlatformRegistryItemDetailRoute: routeMocks.registryItemDetail,
  handlePlatformRegistryItemVersionsRoute: routeMocks.registryItemVersions,
  handlePlatformRegistryItemsCreateRoute: routeMocks.registryItemsCreate,
  handlePlatformRegistryLookupRoute: routeMocks.registryLookup,
  handlePlatformRegistryOwnedItemsRoute: routeMocks.registryOwned,
  handlePlatformRegistryConsumptionRoute: routeMocks.registryConsumption,
}));

vi.mock("@/apps/platform/routes/collections", () => ({
  handlePlatformCollectionsRoute: routeMocks.collections,
  handlePlatformCollectionDetailRoute: routeMocks.collectionDetail,
  handlePlatformCollectionItemsRoute: routeMocks.collectionItems,
  handlePlatformCollectionItemDetailRoute: routeMocks.collectionItemDetail,
}));

vi.mock("@/apps/platform/routes/projects", () => ({
  handlePlatformProjectsRoute: routeMocks.projects,
  handlePlatformProjectDetailRoute: routeMocks.projectDetail,
  handlePlatformProjectItemsRoute: routeMocks.projectItems,
  handlePlatformProjectItemDetailRoute: routeMocks.projectItemDetail,
}));

vi.mock("@/apps/platform/routes/project-members", () => ({
  handlePlatformProjectMembersRoute: routeMocks.projectMembers,
  handlePlatformProjectMemberDetailRoute: routeMocks.projectMemberDetail,
  handlePlatformProjectInvitationDetailRoute: routeMocks.projectInvitationDetail,
}));

vi.mock("@/apps/platform/routes/notifications", () => ({
  handlePlatformNotificationsRoute: routeMocks.notifications,
  handlePlatformNotificationDetailRoute: routeMocks.notificationDetail,
  handlePlatformNotificationsMarkAllReadRoute: routeMocks.notificationsMarkAllRead,
}));

vi.mock("@/apps/platform/routes/workspace", () => ({
  handlePlatformWorkspaceCurrentRoute: routeMocks.workspaceCurrent,
}));

vi.mock("@/apps/platform/routes/team", () => ({
  handlePlatformTeamCurrentCollaborationRoute:
    routeMocks.teamCurrentCollaboration,
}));

vi.mock("@/apps/platform/routes/apikeys", () => ({
  handlePlatformApiKeyPolicyRoute: routeMocks.apiKeyPolicy,
}));

import { createPlatformApp } from "@/apps/platform/app";

describe("createPlatformApp", () => {
  beforeEach(() => {
    for (const mock of Object.values(routeMocks)) {
      mock.mockClear();
    }
  });

  it("routes collection item deletion to the collection item detail handler", async () => {
    const app = createPlatformApp();

    const response = await app.fetch(
      new Request("http://localhost/collections/col-1/items/item-2", {
        method: "DELETE",
      }),
    );

    expect(routeMocks.collectionItemDetail).toHaveBeenCalledTimes(1);
    expect(routeMocks.collectionItems).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("routes project item deletion to the project item detail handler", async () => {
    const app = createPlatformApp();

    const response = await app.fetch(
      new Request("http://localhost/projects/proj-1/items/item-2", {
        method: "DELETE",
      }),
    );

    expect(routeMocks.projectItemDetail).toHaveBeenCalledTimes(1);
    expect(routeMocks.projectItems).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("routes project members requests separately from project detail", async () => {
    const app = createPlatformApp();

    await app.fetch(
      new Request("http://localhost/projects/proj-1/members", {
        method: "GET",
      }),
    );

    expect(routeMocks.projectMembers).toHaveBeenCalledTimes(1);
    expect(routeMocks.projectDetail).not.toHaveBeenCalled();
  });

  it("routes project member patch requests to the project member detail handler", async () => {
    const app = createPlatformApp();

    await app.fetch(
      new Request("http://localhost/projects/proj-1/members/member-2", {
        method: "PATCH",
      }),
    );

    expect(routeMocks.projectMemberDetail).toHaveBeenCalledTimes(1);
    expect(routeMocks.projectMembers).not.toHaveBeenCalled();
  });

  it("routes API key policy requests to the API key policy handler", async () => {
    const app = createPlatformApp();

    await app.fetch(
      new Request("http://localhost/apikeys/key-123/policy", {
        method: "PUT",
      }),
    );

    expect(routeMocks.apiKeyPolicy).toHaveBeenCalledTimes(1);
  });

  it("routes notifications mark-all-read separately from the list handler", async () => {
    const app = createPlatformApp();

    await app.fetch(
      new Request("http://localhost/notifications/mark-all-read", {
        method: "POST",
      }),
    );

    expect(routeMocks.notificationsMarkAllRead).toHaveBeenCalledTimes(1);
    expect(routeMocks.notifications).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown routes", async () => {
    const app = createPlatformApp();

    const response = await app.fetch(
      new Request("http://localhost/not-a-route", { method: "GET" }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
