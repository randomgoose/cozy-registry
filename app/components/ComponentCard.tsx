"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ComponentCardProps {
  owner: string;
  name: string;
  title: string;
  description: string | null;
  type: string;
}

export function ComponentCard({
  owner,
  name,
  title,
  description,
  type,
}: ComponentCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      const res = await fetch(`/api/r/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const code = data.files?.[0]?.content ?? "";
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative h-40 w-full overflow-hidden rounded-t-xl border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
        <iframe
          src={`/preview/${owner}/${name}`}
          title={`${title} 预览`}
          className="absolute left-0 top-0 h-[400px] w-[800px] origin-top-left scale-50"
          sandbox="allow-scripts"
        />
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {type.replace("registry:", "")}
          </span>
          <h2 className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
            {description || "—"}
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="shrink-0"
          onClick={handleCopy}
        >
          {copied ? "已复制" : "复制代码"}
        </Button>
      </div>
      <a
        href={`/registry/${owner}/${name}`}
        className="block border-t border-zinc-200 px-5 py-3 text-sm text-blue-600 hover:bg-zinc-50 hover:underline dark:border-zinc-700 dark:text-blue-400 dark:hover:bg-zinc-800/50"
      >
        查看详情 →
      </a>
    </article>
  );
}
