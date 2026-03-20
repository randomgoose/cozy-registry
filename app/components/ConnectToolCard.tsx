"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ConnectToolCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  mcpUrl: string;
};

export function ConnectToolCard(props: ConnectToolCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(props.mcpUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900" />
        }
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
          {props.eyebrow}
        </p>
        <h3 className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {props.title}
        </h3>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {props.description}
        </p>
      </DialogTrigger>

      <DialogContent className="max-w-lg rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader className="gap-2">
          <DialogTitle className="text-lg font-semibold">
            {props.title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {props.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              MCP URL
            </p>
            <code className="mt-2 block break-all rounded-xl bg-white px-3 py-3 text-xs text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
              {props.mcpUrl}
            </code>
          </div>
        </div>

        <DialogFooter className="mt-2 sm:justify-between">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {copied ? "已复制 MCP URL" : "复制 MCP URL"}
          </button>
          <a
            href={props.actionHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {props.actionLabel}
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

