import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "@cozy/auth-runtime/user-notifications";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

type NotificationsContext = Pick<PlatformRequestContext, "userId">;

export async function listNotifications(input: {
  context: NotificationsContext;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(input.context.userId),
    countUnreadNotifications(input.context.userId),
  ]);

  return { status: 200, body: { notifications, unreadCount } };
}

export async function markNotificationAsRead(input: {
  context: NotificationsContext;
  notificationId: string;
  body: { read?: boolean } | null;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (!input.body || input.body.read !== true) {
    return { status: 400, body: { error: "Expected { read: true }" } };
  }

  const ok = await markNotificationRead(
    input.context.userId,
    input.notificationId,
  );
  if (!ok) {
    return { status: 404, body: { error: "Not found" } };
  }

  return { status: 200, body: { ok: true } };
}

export async function markAllNotificationsAsRead(input: {
  context: NotificationsContext;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  await markAllNotificationsRead(input.context.userId);
  return { status: 200, body: { ok: true } };
}
