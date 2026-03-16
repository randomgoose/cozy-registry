"use client";

import type { ChangeEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CodeBlock } from "./CodeBlock";

interface VersionInfo {
  version: string;
  createdAt: Date;
  createdBy: string | null;
}

interface ComponentDetailProps {
  owner: string;
  name: string;
  title: string;
  description: string | null;
  type: string;
  code: string;
  /** 完整安装 URL（如 https://xxx.vercel.app/api/r/owner/name），用于 shadcn add；未设置时仅展示路径 */
  installUrl: string | null;
  /** 当前最新版本号 */
  currentVersion: string;
  /** 当前选中的版本（用于展示与安装命令） */
  selectedVersion: string;
  /** 版本列表（含当前），用于版本选择器 */
  versions: VersionInfo[];
  /** 是否为当前登录用户自己的组件（owner） */
  isOwner: boolean;
}

export function ComponentDetail({
  owner,
  name,
  title,
  description,
  type,
  code,
  installUrl,
  currentVersion,
  selectedVersion,
  versions,
  isOwner,
}: ComponentDetailProps) {
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const baseInstallUrl =
    installUrl ?? `https://你的registry域名/api/r/${owner}/${name}`;
  const installUrlWithVersion =
    selectedVersion && selectedVersion !== currentVersion
      ? `${baseInstallUrl}?v=${encodeURIComponent(selectedVersion)}`
      : baseInstallUrl;
  const shadcnCommand = `npx shadcn@latest add ${installUrlWithVersion}`;

  async function handleCopyCommand() {
    await navigator.clipboard.writeText(shadcnCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  }

  const typeLabel = type.replace("registry:", "") === "block" ? "模块" : "组件";
  const previewHref =
    selectedVersion && selectedVersion !== currentVersion
      ? `/preview/${owner}/${name}?v=${encodeURIComponent(selectedVersion)}`
      : `/preview/${owner}/${name}`;

  function handleVersionChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === currentVersion) {
      router.push(`/registry/${owner}/${name}`);
    } else {
      router.push(`/registry/${owner}/${name}?v=${encodeURIComponent(v)}`);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    const confirmed = window.confirm(
      "确定要删除这个组件吗？此操作会删除所有版本，且不可恢复。",
    );
    if (!confirmed) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/registry/${owner}/${name}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error || `删除失败（${res.status}）`;
        window.alert(msg);
        return;
      }
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <nav className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Link
              href="/"
              className="hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              列表
            </Link>
            <span aria-hidden>/</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {owner}
            </span>
            <span aria-hidden>/</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {name}
            </span>
          </nav>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {typeLabel}
                </span>
                {versions.length > 0 && (
                  <>
                    <span className="text-zinc-400 dark:text-zinc-500">·</span>
                    <span className="rounded bg-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                      v{selectedVersion}
                    </span>
                    {versions.length > 1 && (
                      <select
                        aria-label="选择版本"
                        value={selectedVersion}
                        onChange={handleVersionChange}
                        className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {versions.map((v) => (
                          <option key={v.version} value={v.version}>
                            v{v.version}
                            {v.version === currentVersion ? " (最新)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>
              <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {title}
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                {description || "—"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                预览
              </Link>
              {isOwner && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/60"
                >
                  {deleting ? "正在删除…" : "删除组件"}
                </button>
              )}
              <button
                onClick={handleCopy}
                className="rounded-lg border border-zinc-200 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {copied ? "已复制" : "复制代码"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <section className="mb-8 space-y-4">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            用于项目
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            引用路径：<code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
              @{owner}/{name}
            </code>
            ，或从本页复制下方代码到你的项目中。
            {versions.length > 1 && (
              <span className="mt-1 block text-zinc-500 dark:text-zinc-500">
                选择具体版本后，安装命令会带上 <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">?v=x.y.z</code>，便于锁定版本或后续按需升级。
              </span>
            )}
          </p>
          <div>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              shadcn CLI（需已安装 shadcn）：复制命令后在项目根目录执行
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-zinc-800 dark:text-zinc-200">
                {shadcnCommand}
              </code>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="shrink-0 rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              >
                {copiedCmd ? "已复制" : "复制命令"}
              </button>
            </div>
            {!installUrl && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                部署时设置 <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">NEXT_PUBLIC_APP_URL</code> 可显示完整可执行命令。
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              TSX
            </span>
            <button
              onClick={handleCopy}
              className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          <CodeBlock code={code} />
        </section>
      </main>
    </div>
  );
}
