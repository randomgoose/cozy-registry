import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { CozyLogoIcon } from "../icons";
import { fetchAuthControlSession } from "../../lib/auth-control";
import { getPlatformBaseUrl } from "../../lib/runtime-config";
import { fetchRegistryCatalog, type RegistryCatalogItem } from "../../lib/platform";

function HomeHeaderAuth() {
  const platformBaseUrl = getPlatformBaseUrl();
  const [phase, setPhase] = useState<"idle" | "loading" | "signed-in" | "signed-out">("idle");

  useEffect(() => {
    if (!platformBaseUrl) {
      setPhase("signed-out");
      return;
    }

    let cancelled = false;
    setPhase("loading");

    fetchAuthControlSession()
      .then((data) => {
        if (cancelled) return;
        setPhase(data?.user?.id ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("signed-out");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [platformBaseUrl]);

  if (phase === "loading" || phase === "idle") {
    return (
      <span
        className="inline-block h-7 w-20 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80"
        aria-hidden
      />
    );
  }

  if (phase === "signed-in") {
    return (
      <a
        href="/dashboard"
        className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Dashboard
      </a>
    );
  }

  return (
    <a
      href="/sign-in"
      className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      Login
    </a>
  );
}

function HomeCatalogState() {
  const [items, setItems] = useState<RegistryCatalogItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const platformBaseUrl = getPlatformBaseUrl();

  useEffect(() => {
    if (!platformBaseUrl) return;

    const controller = new AbortController();
    setStatus("loading");

    fetchRegistryCatalog(controller.signal)
      .then((catalog) => {
        setItems(catalog?.items ?? []);
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load platform registry catalog", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, [platformBaseUrl]);

  const visibleItems = useMemo(() => items.slice(0, 6), [items]);

  return (
    <section className="mt-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Public catalog
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Browse registry items through the extracted platform boundary.
          </h2>
        </div>
        <a
          href="/registry"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Open the migrated catalog
          <ArrowRight className="size-4" />
        </a>
      </div>

      {!platformBaseUrl ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-zinc-300 bg-white/70 px-6 py-8 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-400">
          Set <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">VITE_COZY_PLATFORM_BASE_URL</code> to let the new Web host read the public catalog directly from <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">cozy-platform</code>.
        </div>
      ) : status === "error" ? (
        <div className="mt-6 rounded-[28px] border border-rose-200 bg-rose-50 px-6 py-8 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          The new Web host could not reach <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">{platformBaseUrl}/registry</code>. Check that <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">pnpm cozy-platform</code> is running.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {status === "loading"
            ? Array.from({ length: 3 }, (_, index) => (
              <div
                key={`skeleton-${index}`}
                className="h-48 animate-pulse rounded-[28px] border border-zinc-200/80 bg-white/75 dark:border-zinc-800 dark:bg-zinc-950/70"
              />
            ))
            : visibleItems.map((item, index) => (
              <article
                key={`${item.name}-${index}`}
                className="rounded-[28px] border border-zinc-200/80 bg-white/88 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.05)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/72 dark:shadow-[0_20px_44px_rgba(0,0,0,0.22)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-300">
                  {item.type}
                </p>
                <h3 className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {item.description || "No description yet."}
                </p>
                <div className="mt-5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-500">
                  <span>{item.name}</span>
                  <a
                    href={`/registry/${item.name}`}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
                  >
                    View
                    <ArrowRight className="size-3.5" />
                  </a>
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}

export function Homepage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_30%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_22%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
      <header>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <a
            href="/"
            className="inline-flex items-center text-zinc-950 transition-colors hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-200"
            aria-label="Cozy Registry"
          >
            <CozyLogoIcon className="size-6" />
          </a>
          <nav className="flex items-center gap-3">
            <a
              href="/docs"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              <BookOpen className="size-4" />
              Docs
            </a>
            <HomeHeaderAuth />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="pt-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Cozy Registry
          </p>
          <h1 className="mx-auto mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-6xl">
            Source-native blocks, UI, and themes for design-led web teams.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400 md:text-base">
            The new Vite host is now the public entry point for the Cozy Web migration, while cozy-platform remains the source of truth behind the registry boundary.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/sign-up"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Sign up
            </a>
            <a
              href="/dashboard"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            >
              Open dashboard
            </a>
          </div>
        </section>

        <HomeCatalogState />
      </main>

      <footer className="border-t border-zinc-200/70 bg-white/30 dark:border-zinc-800/80 dark:bg-zinc-950/20">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 text-sm text-zinc-500 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CozyLogoIcon className="size-4" />
            <span>Cozy Registry</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/docs"
              className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Docs
            </a>
            <a
              href="/sign-up"
              className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Sign up
            </a>
            <span className="text-zinc-400 dark:text-zinc-500">
              Source-native registry for AI workflows
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
