"use client";

import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CodeBlock } from "./CodeBlock";
import { Button } from "@/components/ui/button";
import { PreviewFrame } from "@/app/components/PreviewFrame";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PropField } from "@/lib/validate-tsx";
import { ThemeTokensTable } from "./ThemeTokensTable";

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
  visibility: "public" | "private";
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
  /** npm 依赖（如 react、clsx） */
  dependencies: string[];
  /** 本 registry 内依赖（如 @owner/other-component） */
  registryDependencies: string[];
  /** 从 TSX 解析出的 Props 接口字段 */
  propsFromCode: PropField[];
  /** 当前版本 bundle 中的所有文件（path + content） */
  files: { path: string; content: string; type: string }[];
}

export function ComponentDetail({
  owner,
  name,
  title,
  description,
  type,
  visibility,
  code,
  installUrl,
  currentVersion,
  selectedVersion,
  versions,
  isOwner,
  dependencies,
  registryDependencies,
  propsFromCode,
  files,
}: ComponentDetailProps) {
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [localVisibility, setLocalVisibility] = useState<"public" | "private">(
    visibility,
  );
  const [localSelectedVersion, setLocalSelectedVersion] =
    useState(selectedVersion);
  const router = useRouter();

  // 当路由参数变化时，同步下拉框与本地状态
  useEffect(() => {
    setLocalSelectedVersion(selectedVersion);
  }, [selectedVersion]);

  useEffect(() => {
    setLocalVisibility(visibility);
  }, [visibility]);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const baseInstallUrl =
    installUrl ?? `https://你的registry域名/api/r/${owner}/${name}`;
  const installUrlWithVersion =
    localSelectedVersion && localSelectedVersion !== currentVersion
      ? `${baseInstallUrl}?v=${encodeURIComponent(localSelectedVersion)}`
      : baseInstallUrl;
  const shadcnCommand = `npx shadcn@latest add ${installUrlWithVersion}`;

  async function handleCopyCommand() {
    await navigator.clipboard.writeText(shadcnCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  }

  const typeLabel =
    type === "registry:theme"
      ? "主题"
      : type.replace("registry:", "") === "block"
        ? "模块"
        : "组件";
  const previewHref =
    localSelectedVersion && localSelectedVersion !== currentVersion
      ? `/preview/${owner}/${name}?v=${encodeURIComponent(
          localSelectedVersion,
        )}`
      : `/preview/${owner}/${name}`;

  function handleVersionChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setLocalSelectedVersion(v);
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

  async function handleToggleVisibility() {
    if (!isOwner || togglingVisibility) return;
    const next = localVisibility === "public" ? "private" : "public";
    const confirmed = window.confirm(
      next === "private"
        ? "设为私有后，只有你自己可以访问/预览/安装这个组件。确定继续吗？"
        : "设为公开后，所有人都可以访问/预览/安装这个组件。确定继续吗？",
    );
    if (!confirmed) return;
    try {
      setTogglingVisibility(true);
      const res = await fetch(`/api/registry/${owner}/${name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error || `更新失败（${res.status}）`;
        window.alert(msg);
        return;
      }
      setLocalVisibility(next);
      router.refresh();
    } finally {
      setTogglingVisibility(false);
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
                <span
                  className={
                    localVisibility === "public"
                      ? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  }
                >
                  {localVisibility === "public" ? "公开" : "私有"}
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
              {(dependencies.length > 0 || registryDependencies.length > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    依赖：
                  </span>
                  {dependencies.map((dep) => (
                    <span
                      key={dep}
                      className="rounded-md bg-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                    >
                      {dep}
                    </span>
                  ))}
                  {registryDependencies.map((ref) => (
                    <span
                      key={ref}
                      className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                    >
                      {ref.startsWith("@") ? ref : `@${ref}`}
                    </span>
                  ))}
                </div>
              )}
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
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleToggleVisibility}
                  disabled={togglingVisibility}
                >
                  {togglingVisibility
                    ? "正在更新…"
                    : localVisibility === "public"
                      ? "设为私有"
                      : "设为公开"}
                </Button>
              )}
              {isOwner && (
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "正在删除…" : "删除组件"}
                </Button>
              )}
              <Button variant="default" size="lg" onClick={handleCopy}>
                {copied ? "已复制" : "复制代码"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {type === "registry:theme" && <ThemeTokensTable files={files} />}

        {files.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              文件列表
            </h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60%] text-zinc-500 dark:text-zinc-400">
                      路径
                    </TableHead>
                    <TableHead className="w-[20%] text-zinc-500 dark:text-zinc-400">
                      类型
                    </TableHead>
                    <TableHead className="w-[20%] text-right text-zinc-500 dark:text-zinc-400">
                      行数
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((f) => {
                    const lines =
                      typeof f.content === "string"
                        ? f.content.split("\n").length
                        : 0;
                    return (
                      <TableRow key={f.path}>
                        <TableCell className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                          {f.path}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                          {f.type.replace("registry:", "")}
                        </TableCell>
                        <TableCell className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                          {lines || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {propsFromCode.length > 0 && type !== "registry:theme" && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Props
            </h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80 hover:bg-zinc-50 dark:hover:bg-zinc-900/80">
                    <TableHead className="text-zinc-500 dark:text-zinc-400">
                      属性
                    </TableHead>
                    <TableHead className="text-zinc-500 dark:text-zinc-400">
                      类型
                    </TableHead>
                    <TableHead className="text-zinc-500 dark:text-zinc-400">
                      可选
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propsFromCode.map((p) => (
                    <TableRow
                      key={p.name}
                      className="border-zinc-100 dark:border-zinc-800"
                    >
                      <TableCell className="font-mono text-zinc-800 dark:text-zinc-200">
                        {p.name}
                      </TableCell>
                      <TableCell className="font-mono text-zinc-600 dark:text-zinc-400">
                        {p.type}
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {p.optional ? "是" : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        <section className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              组件预览
            </h2>
            <Link
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              在新窗口打开
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <PreviewFrame
              title={`${title} 预览`}
              src={previewHref}
              className="h-[420px] w-full"
            />
          </div>
        </section>

        {versions.length > 0 && (
          <section className="mb-8 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                版本历史
              </h2>
              {selectedVersion !== currentVersion && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                  当前查看 v{selectedVersion}，最新为 v{currentVersion}
                </span>
              )}
            </div>
            <ul className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {versions.map((v) => {
                const date =
                  v.createdAt instanceof Date
                    ? v.createdAt
                    : new Date(v.createdAt);
                const isLatest = v.version === currentVersion;
                return (
                  <li
                    key={v.version}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-100">
                        v{v.version}
                      </span>
                      {isLatest && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
                          最新
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col items-end gap-0.5 text-right">
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {date.toLocaleString()}
                      </span>
                      {v.createdBy && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          by {v.createdBy}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleCopyCommand}
              >
                {copiedCmd ? "已复制" : "复制命令"}
              </Button>
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
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? "已复制" : "复制"}
            </Button>
          </div>
          <CodeBlock code={code} language={type === "registry:theme" ? "css" : "tsx"} />
        </section>
      </main>
    </div>
  );
}
