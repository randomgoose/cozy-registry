import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import {
  fetchCurrentWorkspace,
  fetchOwnedRegistryItems,
  type OwnedRegistryItem,
  type WorkspaceData,
} from "../../lib/platform";
import { getPlatformBaseUrl } from "../../lib/runtime-config";
import { AppShellLite } from "../layout/app-shell-lite";

function DashboardEmptyState() {
  return (
    <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
      <div className="mx-auto max-w-2xl">
        <p className="text-zinc-700 dark:text-zinc-300">
          You haven&apos;t published anything yet.
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          The new Vite host is now reading your registry data through cozy-platform.
          Publishing flows already run locally here, while the rest of the authenticated shell continues converging on project-first navigation.
        </p>
        <div className="mt-6 flex justify-center">
          <a
            href="/publish"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Publish first item
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function DashboardCards({ items }: { items: OwnedRegistryItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/85 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                {item.type}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {item.title}
              </h3>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                item.visibility === "private"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {item.visibility === "private" ? "Private" : "Public"}
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {item.description || "No description yet."}
          </p>

          <div className="mt-5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-500">
            <span>@{item.ownerHandle ?? "owner"} / {item.name}</span>
            <a
              href={`/registry/${item.ownerHandle ?? "registry"}/${item.name}`}
              className="inline-flex items-center gap-1 font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              Open
              <ArrowRight className="size-3.5" />
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [items, setItems] = useState<OwnedRegistryItem[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "error">(
    "loading",
  );

  useEffect(() => {
    const controller = new AbortController();
    const platformBaseUrl = getPlatformBaseUrl();

    if (!platformBaseUrl) {
      setStatus("error");
      return () => controller.abort();
    }

    Promise.all([
      fetchCurrentWorkspace(controller.signal),
      fetchOwnedRegistryItems(controller.signal),
    ])
      .then(([workspaceData, ownedItems]) => {
        if (!workspaceData || !ownedItems) {
          setStatus("signed-out");
          return;
        }

        setWorkspace(workspaceData);
        setItems(ownedItems);
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load dashboard data", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  const publicCount = useMemo(
    () => (items ?? []).filter((item) => item.visibility === "public").length,
    [items],
  );
  const privateCount = (items?.length ?? 0) - publicCount;

  if (status === "signed-out") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="max-w-md rounded-[28px] border border-zinc-200 bg-white/92 p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <Lock className="mx-auto size-8 text-zinc-400 dark:text-zinc-500" />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Sign in to view your items
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Sign in through the migrated control plane to load your registry workspace.
          </p>
          <div className="mt-6">
            <a
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Continue to sign in
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="max-w-2xl rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          Dashboard could not reach the extracted platform APIs. Make sure <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">VITE_COZY_PLATFORM_BASE_URL</code> points at a running <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">cozy-platform</code> host.
        </div>
      </div>
    );
  }

  const workspaceName = workspace?.workspace?.name ?? "Workspace";

  return (
    <AppShellLite
      title={workspaceName}
      subtitle="Authenticated navigation is migrating route by route. This dashboard already reads through cozy-platform."
    >
      <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Personal space
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Your registry workspace
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Manage everything published under your account through the extracted platform boundary.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/publish"
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Publish new item
            </a>
            <a
              href="/projects"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            >
              Open projects
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Total items
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {items?.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Public
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {publicCount}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Private
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {privateCount}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-zinc-50/90 px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:text-zinc-400 dark:ring-zinc-800">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {workspace?.teams.length ?? 0}
          </span>{" "}
          access groups,{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {workspace?.members.length ?? 0}
          </span>{" "}
          members, and{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {workspace?.invitations.length ?? 0}
          </span>{" "}
          pending invites in the active workspace.
        </div>
      </section>

      <section className="mt-8">
        {(items?.length ?? 0) === 0 ? (
          <DashboardEmptyState />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Sparkles className="size-4" />
              Browsing owned items through <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">cozy-platform</code>
            </div>
            <DashboardCards items={items ?? []} />
          </>
        )}
      </section>
    </AppShellLite>
  );
}
