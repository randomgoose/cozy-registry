"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PromptCard(props: { title: string; body: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(props.body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {props.title}
        </h3>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "已复制" : "复制 Prompt"}
        </Button>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
        <code>{props.body}</code>
      </pre>
    </div>
  );
}
