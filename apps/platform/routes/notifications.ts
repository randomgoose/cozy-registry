import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@cozy/platform-services/notifications-service";

export async function handlePlatformNotificationsRoute(
  request: Request,
): Promise<Response> {
  const context = await getPlatformRequestContext(request);

  if (request.method === "GET") {
    const result = await listNotifications({ context });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformNotificationDetailRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [notificationId] = url.pathname
    .replace(/^\/notifications\//, "")
    .split("/")
    .filter(Boolean);

  if (!notificationId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof markNotificationAsRead
    >[0]["body"];
    const result = await markNotificationAsRead({
      context,
      notificationId,
      body,
    });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformNotificationsMarkAllReadRoute(
  request: Request,
): Promise<Response> {
  const context = await getPlatformRequestContext(request);
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const result = await markAllNotificationsAsRead({ context });
  return Response.json(result.body, { status: result.status });
}
