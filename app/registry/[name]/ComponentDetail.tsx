"use client";

import { useState } from "react";

interface ComponentDetailProps {
  name: string;
  title: string;
  description: string | null;
  type: string;
  code: string;
}

export function ComponentDetail({
  name,
  title,
  description,
  type,
  code,
}: ComponentDetailProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <a
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            ← 返回列表
          </a>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {type.replace("registry:", "")}
              </span>
              <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {title}
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                {description || "—"}
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {copied ? "已复制" : "复制代码"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-900 p-4 text-sm text-zinc-100 dark:border-zinc-800">
          <code>{code}</code>
        </pre>
      </main>
    </div>
  );
}
