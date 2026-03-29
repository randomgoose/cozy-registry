import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { fetchRegistryCatalog, type RegistryCatalogItem } from "../../lib/platform";
import { getPlatformBaseUrl } from "../../lib/runtime-config";

export function RegistryPage() {
  const [items, setItems] = useState<RegistryCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const platformBaseUrl = getPlatformBaseUrl();

    if (!platformBaseUrl) {
      setStatus("error");
      return () => controller.abort();
    }

    fetchRegistryCatalog(controller.signal)
      .then((catalog) => {
        setItems(catalog?.items ?? []);
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load registry catalog", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((item) =>
      [item.title, item.name, item.type, item.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [items, query]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_30%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_22%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
      <header>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <a
            href="/"
            className="text-sm font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            Cozy Registry
          </a>
          <a
            href="/"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
          >
            Back to homepage
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Registry browser
          </p>
          <h1 className="mx-auto mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-5xl">
            Browse public registry items from the new Vite host.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400 md:text-base">
            This view is now reading directly from <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">cozy-platform /registry</code>. Detail and preview routes are also available locally in the migrated host.
          </p>
        </section>

        <section className="mt-10">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, name, type, or description"
              className="w-full rounded-[22px] border border-zinc-200/80 bg-white/90 px-12 py-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500 dark:focus:ring-amber-500/10"
            />
          </label>
        </section>

        <section className="mt-8">
          {status === "error" ? (
            <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              Registry browsing could not reach <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">cozy-platform /registry</code>. Check your <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">VITE_COZY_PLATFORM_BASE_URL</code> configuration.
            </div>
          ) : status === "loading" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={`registry-skeleton-${index}`}
                  className="h-44 animate-pulse rounded-[28px] border border-zinc-200/80 bg-white/75 dark:border-zinc-800 dark:bg-zinc-950/70"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
              <p className="text-zinc-700 dark:text-zinc-300">No matching registry items.</p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Try a broader search query or publish a new item to expand the catalog.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => (
                <article
                  key={item.name}
                  className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-300">
                    {item.type}
                  </p>
                  <h2 className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    {item.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {item.description || "No description yet."}
                  </p>
                  <div className="mt-5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{item.name}</span>
                    <a
                      href={`/registry/${item.name}`}
                      className="inline-flex items-center gap-1 font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
                    >
                      View detail
                      <ArrowRight className="size-3.5" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
