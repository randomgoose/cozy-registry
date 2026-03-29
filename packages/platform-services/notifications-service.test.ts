import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationMocks = vi.hoisted(() => ({
  listNotificationsForUser: vi.fn(),
  countUnreadNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("@cozy/auth-runtime/user-notifications", () => notificationMocks);

import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@cozy/platform-services/notifications-service";

describe("notifications-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when listing notifications anonymously", async () => {
    const result = await listNotifications({
      context: { userId: null },
    });

    expect(result).toEqual({
      status: 401,
      body: { error: "Unauthorized" },
    });
  });

  it("returns notifications plus unread count for authenticated users", async () => {
    notificationMocks.listNotificationsForUser.mockResolvedValue([
      {
        id: "notif-1",
        title: "Invite",
        body: "Acme · viewer",
        actionUrl: "/accept-invitation?invitationId=abc",
        readAt: null,
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
      },
    ]);
    notificationMocks.countUnreadNotifications.mockResolvedValue(3);

    const result = await listNotifications({
      context: { userId: "user-1" },
    });

    expect(notificationMocks.listNotificationsForUser).toHaveBeenCalledWith(
      "user-1",
    );
    expect(notificationMocks.countUnreadNotifications).toHaveBeenCalledWith(
      "user-1",
    );
    expect(result.status).toBe(200);
    expect(result.body.unreadCount).toBe(3);
    expect(result.body.notifications).toHaveLength(1);
  });

  it("rejects invalid mark-as-read payloads before hitting storage", async () => {
    const result = await markNotificationAsRead({
      context: { userId: "user-1" },
      notificationId: "notif-1",
      body: { read: false },
    });

    expect(result).toEqual({
      status: 400,
      body: { error: "Expected { read: true }" },
    });
    expect(notificationMocks.markNotificationRead).not.toHaveBeenCalled();
  });

  it("returns 404 when the notification is missing", async () => {
    notificationMocks.markNotificationRead.mockResolvedValue(false);

    const result = await markNotificationAsRead({
      context: { userId: "user-1" },
      notificationId: "notif-404",
      body: { read: true },
    });

    expect(result).toEqual({
      status: 404,
      body: { error: "Not found" },
    });
  });

  it("marks all notifications as read for authenticated users", async () => {
    notificationMocks.markAllNotificationsRead.mockResolvedValue(undefined);

    const result = await markAllNotificationsAsRead({
      context: { userId: "user-1" },
    });

    expect(notificationMocks.markAllNotificationsRead).toHaveBeenCalledWith(
      "user-1",
    );
    expect(result).toEqual({
      status: 200,
      body: { ok: true },
    });
  });
});
