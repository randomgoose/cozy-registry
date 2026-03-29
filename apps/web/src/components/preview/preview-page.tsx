import { ArrowLeft, ExternalLink } from "lucide-react";
import { getPlatformBaseUrl } from "../../lib/runtime-config";

type PreviewPageProps = {
  owner: string;
  name: string;
  version?: string | null;
};

export function PreviewPage({ owner, name, version = null }: PreviewPageProps) {
  const platformBaseUrl = getPlatformBaseUrl();

  if (!platformBaseUrl) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          Preview requires <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">VITE_COZY_PLATFORM_BASE_URL</code> so the new host can embed <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">cozy-platform /preview</code>.
        </div>
      </div>
    );
  }

  const search = version ? `?v=${encodeURIComponent(version)}` : "";
  const previewUrl = `${platformBaseUrl}/preview/${owner}/${name}${search}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a
            href={`/registry/${owner}/${name}${search}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="size-4" />
            Back to detail
          </a>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
          >
            Open raw preview
            <ExternalLink className="size-4" />
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="rounded-[28px] border border-zinc-200/80 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <iframe
            title={`Preview for ${owner}/${name}`}
            src={previewUrl}
            className="h-[calc(100vh-10rem)] w-full rounded-[22px] border border-zinc-200 dark:border-zinc-800"
          />
        </div>
      </main>
    </div>
  );
}
