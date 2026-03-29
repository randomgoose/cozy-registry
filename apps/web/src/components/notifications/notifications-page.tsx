import { useEffect, useState } from "react";
import { ArrowRight, Bell } from "lucide-react";
import { fetchAuthControlSession } from "../../lib/auth-control";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationReadById,
  type NotificationItem,
} from "../../lib/platform";
import { AppShellLite } from "../layout/app-shell-lite";

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "error">(
    "loading",
  );

  async function load() {
    const session = await fetchAuthControlSession();
    if (!session?.user) {
      setItems([]);
      setUnread(0);
      setStatus("signed-out");
      return;
    }

    try {
      const data = await fetchNotifications();
      setItems(data?.notifications ?? []);
      setUnread(data?.unreadCount ?? 0);
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load notifications", error);
      setStatus("error");
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  async function handleSelect(item: NotificationItem) {
    if (!item.readAt) {
      await markNotificationReadById(item.id);
      setUnread((current) => Math.max(0, current - 1));
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      );
    }

    if (item.actionUrl) {
      window.location.assign(item.actionUrl);
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setUnread(0);
    setItems((current) =>
      current.map((entry) => ({
        ...entry,
        readAt: entry.readAt ?? new Date().toISOString(),
      })),
    );
  }

  if (status === "signed-out") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Sign in to see notifications
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Notification reads are already available through the extracted platform APIs.
          </p>
          <a
            href="/sign-in?callbackUrl=%2Fnotifications"
            className="mt-6 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Continue to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <AppShellLite
      title="Notifications"
      subtitle="This inbox is now hosted in the migrated web app and reads from cozy-platform."
    >
      <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Inbox
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Team invites and activity updates now stay inside the migrated host.
            </p>
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            >
              Mark all read
            </button>
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Unread
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{unread}</p>
        </div>

        <div className="mt-6">
          {status === "loading" ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
          ) : status === "error" ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Could not load notifications from cozy-platform.
            </p>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
              <Bell className="mx-auto size-5 text-zinc-400 dark:text-zinc-500" />
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No notifications yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleSelect(item)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    item.readAt
                      ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      : "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                        {item.title}
                      </div>
                      {item.body ? (
                        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {item.body}
                        </div>
                      ) : null}
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-zinc-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShellLite>
  );
}
