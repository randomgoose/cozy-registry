import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, Trash2 } from "lucide-react";
import { fetchAuthControlSession } from "../../lib/auth-control";
import {
  deleteRegistryItem,
  fetchRegistryInstallPayload,
  fetchRegistryItemMeta,
  fetchRegistryItemVersions,
  type RegistryInstallPayload,
  type RegistryItemMeta,
  type RegistryVersions,
  updateRegistryVisibility,
} from "../../lib/platform";
import { getPlatformBaseUrl } from "../../lib/runtime-config";
import { CodeBlockLite } from "./code-block-lite";

type RegistryDetailPageProps = {
  owner: string;
  name: string;
  version?: string | null;
};

export function RegistryDetailPage({
  owner,
  name,
  version = null,
}: RegistryDetailPageProps) {
  const [meta, setMeta] = useState<RegistryItemMeta | null>(null);
  const [versions, setVersions] = useState<RegistryVersions | null>(null);
  const [payload, setPayload] = useState<RegistryInstallPayload | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">(
    "loading",
  );

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");

    Promise.all([
      fetchRegistryItemMeta(owner, name, controller.signal),
      fetchRegistryItemVersions(owner, name, controller.signal),
      fetchRegistryInstallPayload(owner, name, version, controller.signal),
    ])
      .then(([metaData, versionData, payloadData]) => {
        if (!metaData || !versionData || !payloadData) {
          setStatus("not-found");
          return;
        }

        setMeta(metaData);
        setVersions(versionData);
        setPayload(payloadData);
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load registry detail", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, [name, owner, version]);

  useEffect(() => {
    fetchAuthControlSession()
      .then((data) => {
        setCurrentUserId(data?.user?.id ?? null);
      })
      .catch((error) => {
        console.error("Failed to load auth-control session", error);
      });
  }, []);

  const selectedVersion = version || versions?.currentVersion || null;
  const firstFile = payload?.files[0] ?? null;
  const installCommand = useMemo(() => {
    const platformBase = getPlatformBaseUrl();
    const baseUrl = platformBase || window.location.origin;
    const baseInstallUrl = `${baseUrl}/r/${owner}/${name}`;
    const installUrl =
      selectedVersion && selectedVersion !== versions?.currentVersion
        ? `${baseInstallUrl}?v=${encodeURIComponent(selectedVersion)}`
        : baseInstallUrl;
    return `npx shadcn@latest add ${installUrl}`;
  }, [name, owner, selectedVersion, versions?.currentVersion]);
  const isOwner = !!meta?.ownerUserId && meta.ownerUserId === currentUserId;

  async function handleDelete() {
    if (busy) return;
    const confirmed = window.confirm(
      `Delete "${meta?.title ?? name}"? This removes all published versions.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await deleteRegistryItem(owner, name);
      if (!result.response.ok) {
        setMessage((result.data?.error as string | undefined) ?? "Failed to delete item.");
        return;
      }
      window.location.assign("/registry");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete item.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleVisibility() {
    if (!meta || busy) return;
    const nextVisibility = meta.visibility === "public" ? "private" : "public";

    setBusy(true);
    setMessage(null);
    try {
      const result = await updateRegistryVisibility(owner, name, nextVisibility);
      if (!result.response.ok) {
        setMessage(
          (result.data?.error as string | undefined) ?? "Failed to update visibility.",
        );
        return;
      }
      setMeta({
        ...meta,
        visibility: nextVisibility,
      });
      setMessage(`Item is now ${nextVisibility}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update visibility.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="h-12 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-[28px] border border-dashed border-zinc-300 bg-white/70 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Item not found
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            We could not find this registry item in cozy-platform.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error" || !meta || !versions || !payload) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          Registry detail could not be loaded from cozy-platform.
        </div>
      </div>
    );
  }

  const previewHref = `/preview/${owner}/${name}${selectedVersion ? `?v=${encodeURIComponent(selectedVersion)}` : ""}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <a
              href="/registry"
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <ArrowLeft className="size-4" />
              Back to registry browser
            </a>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={previewHref}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
              >
                <Eye className="size-4" />
                Open preview
              </a>
              {isOwner ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleToggleVisibility()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
                  >
                    Make {meta.visibility === "public" ? "private" : "public"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    <Trash2 className="size-4" />
                    Delete item
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              {meta.type}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {meta.title}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {meta.description || "No description yet."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>@{owner}</span>
              <span>/</span>
              <span>{name}</span>
              <span className="text-zinc-300 dark:text-zinc-600">•</span>
              <span className="rounded bg-zinc-200 px-2 py-0.5 font-mono text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                v{selectedVersion}
              </span>
              <span
                className={
                  meta.visibility === "private"
                    ? "rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                }
              >
                {meta.visibility === "private" ? "Private" : "Public"}
              </span>
            </div>
            {message ? (
              <p className="mt-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
                {message}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-900/90">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Current version
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              v{versions.currentVersion}
            </p>
          </div>
          <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-900/90">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Bundle files
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {payload.files.length}
            </p>
          </div>
          <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-900/90">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Versions
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {versions.versions.length}
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-900/90">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  Primary file
                </h2>
                {firstFile ? (
                  <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                    {firstFile.path}
                  </span>
                ) : null}
              </div>
              <div className="mt-4">
                <CodeBlockLite code={firstFile?.content ?? ""} />
              </div>
            </div>

            <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-900/90">
              <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Install command
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Install snippets now point directly at the extracted platform host.
              </p>
              <div className="mt-4 rounded-[24px] border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                <code className="whitespace-pre-wrap break-all text-sm text-zinc-800 dark:text-zinc-200">
                  {installCommand}
                </code>
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-900/90">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Dependencies
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {(payload.dependencies ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No external dependencies.
                  </p>
                ) : (
                  payload.dependencies?.map((dependency) => (
                    <span
                      key={dependency}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {dependency}
                    </span>
                  ))
                )}
              </div>
              {(payload.registryDependencies ?? []).length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Registry dependencies
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {payload.registryDependencies?.map((dependency) => (
                      <span
                        key={dependency}
                        className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                      >
                        {dependency}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-900/90">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Version history
              </h2>
              <div className="mt-4 space-y-3">
                {versions.versions.map((entry) => (
                  <div
                    key={entry.version}
                    className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        v{entry.version}
                      </span>
                      <a
                        href={`/registry/${owner}/${name}?v=${encodeURIComponent(entry.version)}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                      >
                        Open
                        <ArrowRight className="size-3.5" />
                      </a>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
