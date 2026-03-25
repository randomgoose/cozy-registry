"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const { data: session } = await authClient.getSession();
    if (!session?.user) {
      setItems([]);
      setUnread(0);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications?: NotificationItem[];
        unreadCount?: number;
      };
      setItems(data.notifications ?? []);
      setUnread(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, pathname]);

  useEffect(() => {
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  async function onSelect(n: NotificationItem) {
    if (!n.readAt) {
      await fetch(`/api/notifications/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ read: true }),
      });
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((p) =>
          p.id === n.id ? { ...p, readAt: new Date().toISOString() } : p,
        ),
      );
    }
    if (n.actionUrl) {
      router.push(n.actionUrl);
      router.refresh();
    }
  }

  async function onMarkAllRead() {
    await fetch("/api/notifications/mark-all-read", {
      method: "POST",
      credentials: "include",
    });
    setUnread(0);
    setItems((prev) =>
      prev.map((p) => ({
        ...p,
        readAt: p.readAt ?? new Date().toISOString(),
      })),
    );
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200/80 bg-white/80 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Bell className="size-[18px]" />
            {unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </button>
        }
      />

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-white/60 bg-white/90 p-0 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95"
      >
        <div className="flex items-center justify-between border-b border-zinc-200/80 px-3 py-2 dark:border-white/10">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Notifications
          </span>
          {unread > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMarkAllRead();
              }}
              className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
            >
              Mark all read
            </button>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              No notifications yet.
            </p>
          ) : (
            items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn(
                  "cursor-pointer rounded-none px-3 py-2.5 text-left",
                  !n.readAt && "bg-amber-50/60 dark:bg-amber-950/20",
                )}
                onClick={() => onSelect(n)}
              >
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {n.title}
                </div>
                {n.body ? (
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {n.body}
                  </div>
                ) : null}
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="px-3 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          Team invites also appear here when the invitee already has an account.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
