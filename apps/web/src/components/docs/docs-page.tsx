import { ArrowLeft } from "lucide-react";
import { CozyLogoIcon } from "../icons";
import { docsNav, getDocsEntry } from "../../../content/docs/runtime";

export function DocsPage(props: { slug?: string | null }) {
  const entry = getDocsEntry(props.slug);

  if (!entry) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_30%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] px-6 py-10 dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_22%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
        <div className="mx-auto max-w-3xl">
          <a href="/docs" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">
            <ArrowLeft className="size-4" />
            Back to docs
          </a>
          <h1 className="mt-6 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            Doc not found
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_30%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_22%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
      <header className="border-b border-zinc-200/70 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <a href="/" className="inline-flex items-center gap-2 text-zinc-950 dark:text-zinc-50" aria-label="Cozy Registry">
            <CozyLogoIcon className="size-6" />
            <span className="text-sm font-medium">Cozy Registry</span>
          </a>
          <a href="/registry" className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">
            Browse registry
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Documentation
          </p>
          <nav className="mt-4 space-y-1">
            {docsNav.map((item) => {
              const active = item.slug === entry.slug;
              return (
                <a
                  key={item.slug}
                  href={item.href}
                  className={`block rounded-2xl px-3 py-2 text-sm transition ${
                    active
                      ? "bg-amber-100 text-amber-950 dark:bg-amber-500/10 dark:text-amber-200"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  }`}
                >
                  {item.title}
                </a>
              );
            })}
          </nav>
        </aside>

        <article className="rounded-[32px] border border-zinc-200/80 bg-white/95 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Docs
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {entry.title}
          </h1>
          <p className="mt-4 text-sm leading-7 text-zinc-600 dark:text-zinc-400 md:text-base">
            {entry.description}
          </p>
          <div className="prose prose-zinc mt-8 max-w-none dark:prose-invert">
            {entry.content}
          </div>
        </article>
      </main>
    </div>
  );
}
