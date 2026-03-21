"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { PreviewFrame } from "./PreviewFrame";
import { CodeBlock } from "@/app/registry/[owner]/[name]/CodeBlock";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  CollectionsBookmarkIcon,
  Copy01Icon,
  CopyCheckIcon,
} from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { extractPropsFromTsx, type PropField } from "@/lib/validate-tsx";

interface ComponentCardProps {
  itemId: string;
  owner: string;
  name: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  thumbnailUrl?: string | null;
}

type ExpandedDetailData = {
  type: string;
  dependencies: string[];
  registryDependencies: string[];
  files: { path: string; content: string; type: string }[];
};

function isCodeFile(path: string): boolean {
  return /\.(tsx?|jsx?|css|json)$/i.test(path);
}

export function ComponentCard({
  itemId,
  owner,
  name,
  title,
  description,
  visibility,
  thumbnailUrl,
}: ComponentCardProps) {
  const layoutTransition = {
    type: "spring",
    stiffness: 240,
    damping: 26,
    mass: 0.95,
  } as const;
  const overlayTransition = {
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1],
  } as const;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [detailData, setDetailData] = useState<ExpandedDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [collections, setCollections] = useState<
    Array<{ id: string; title: string; slug: string }>
  >([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const cardLayoutId = `registry-card-${itemId}`;
  const preferredFile =
    detailData?.files?.find((file) => file.path === selectedPath) ??
    detailData?.files?.find((file) => /\.(tsx?|jsx?)$/i.test(file.path)) ??
    detailData?.files?.find((file) => isCodeFile(file.path)) ??
    detailData?.files?.[0] ??
    null;
  const code = preferredFile?.content ?? "";
  const propsFromCode: PropField[] =
    detailData?.type && detailData.type !== "registry:theme" && code
      ? extractPropsFromTsx(code)
      : [];
  const installCommand =
    typeof window !== "undefined"
      ? `npx shadcn@latest add ${window.location.origin}/api/r/${owner}/${name}`
      : `npx shadcn@latest add /api/r/${owner}/${name}`;

  async function handleCopy() {
    try {
      const res = await fetch(
        `/api/r/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      );
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

  async function ensureCollectionsLoaded() {
    if (collectionsLoading || collections.length > 0) return;
    setCollectionsLoading(true);
    try {
      const res = await fetch("/api/collections", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { collections?: Array<{ id: string; title: string; slug: string }> }
        | null;
      setCollections(Array.isArray(data?.collections) ? data.collections : []);
    } finally {
      setCollectionsLoading(false);
    }
  }

  async function addToCollection() {
    if (!selectedCollectionId || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/collections/${selectedCollectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        alert(err?.error ?? "Failed to add to collection");
        return;
      }
      setAddOpen(false);
      setSelectedCollectionId("");
    } finally {
      setAdding(false);
    }
  }

  function stopCardClick(event: React.MouseEvent) {
    event.stopPropagation();
  }

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    }
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded || detailData || detailLoading) return;
    let cancelled = false;
    async function loadDetailData() {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(
          `/api/r/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) {
            setDetailError(`加载失败（${res.status}）`);
          }
          return;
        }
        const data = (await res.json()) as ExpandedDetailData;
        if (!cancelled) {
          setDetailData(data);
          const nextSelectedPath =
            data.files?.find((file) => /\.(tsx?|jsx?)$/i.test(file.path))?.path ??
            data.files?.find((file) => isCodeFile(file.path))?.path ??
            data.files?.[0]?.path ??
            null;
          setSelectedPath(nextSelectedPath);
        }
      } catch {
        if (!cancelled) {
          setDetailError("加载失败");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }
    void loadDetailData();
    return () => {
      cancelled = true;
    };
  }, [detailData, detailLoading, expanded, name, owner]);

  function renderActionButtons() {
    return (
      <div className="relative z-40 flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full bg-black/45 text-white hover:bg-black/60 hover:text-white dark:bg-black/45 dark:text-white dark:hover:bg-black/60"
          onClick={(event) => {
            stopCardClick(event);
            void handleCopy();
          }}
          aria-label={copied ? "已复制代码" : "复制代码"}
          title={copied ? "已复制" : "复制代码"}
        >
          <HugeiconsIcon
            icon={copied ? CopyCheckIcon : Copy01Icon}
            strokeWidth={1.8}
          />
        </Button>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger
            onClick={(event) => {
              stopCardClick(event);
              void ensureCollectionsLoaded();
            }}
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full bg-black/45 text-white hover:bg-black/60 hover:text-white dark:bg-black/45 dark:text-white dark:hover:bg-black/60"
                aria-label="加入 Collection"
                title="加入 Collection"
              />
            }
          >
            <HugeiconsIcon icon={CollectionsBookmarkIcon} strokeWidth={1.8} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>加入 Collection</DialogTitle>
            </DialogHeader>

            {collectionsLoading ? (
              <p className="text-sm text-zinc-500">加载中...</p>
            ) : collections.length === 0 ? (
              <p className="text-sm text-zinc-500">
                你还没有 Collections（先去 Collections 页面创建）
              </p>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  选择一个 Collection
                </label>
                <select
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">请选择…</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.title} ({collection.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="default"
                disabled={
                  !selectedCollectionId ||
                  adding ||
                  collectionsLoading ||
                  collections.length === 0
                }
                onClick={addToCollection}
              >
                {adding ? "加入中..." : "加入"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  function renderFloatingActionButtons() {
    return (
      <motion.div
        className="pointer-events-auto absolute left-full top-0 z-[60] ml-3 hidden flex-col gap-2 lg:flex"
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: 0.04 }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-2xl border border-white/12 bg-zinc-950/88 text-white shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur hover:bg-zinc-950 hover:text-white dark:border-white/12 dark:bg-zinc-950/88 dark:text-white dark:hover:bg-zinc-950"
          onClick={(event) => {
            stopCardClick(event);
            void handleCopy();
          }}
          aria-label={copied ? "已复制代码" : "复制代码"}
          title={copied ? "已复制" : "复制代码"}
        >
          <HugeiconsIcon
            icon={copied ? CopyCheckIcon : Copy01Icon}
            strokeWidth={1.8}
          />
        </Button>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger
            onClick={(event) => {
              stopCardClick(event);
              void ensureCollectionsLoaded();
            }}
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-2xl border border-white/12 bg-zinc-950/88 text-white shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur hover:bg-zinc-950 hover:text-white dark:border-white/12 dark:bg-zinc-950/88 dark:text-white dark:hover:bg-zinc-950"
                aria-label="加入 Collection"
                title="加入 Collection"
              />
            }
          >
            <HugeiconsIcon icon={CollectionsBookmarkIcon} strokeWidth={1.8} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>加入 Collection</DialogTitle>
            </DialogHeader>

            {collectionsLoading ? (
              <p className="text-sm text-zinc-500">加载中...</p>
            ) : collections.length === 0 ? (
              <p className="text-sm text-zinc-500">
                你还没有 Collections（先去 Collections 页面创建）
              </p>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  选择一个 Collection
                </label>
                <select
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">请选择…</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.title} ({collection.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="default"
                disabled={
                  !selectedCollectionId ||
                  adding ||
                  collectionsLoading ||
                  collections.length === 0
                }
                onClick={addToCollection}
              >
                {adding ? "加入中..." : "加入"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  return (
    <>
      <article
        className="group relative cursor-pointer overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        onClick={() => setExpanded(true)}
      >
        <motion.div
          layoutId={cardLayoutId}
          transition={layoutTransition}
          className="relative h-56 w-full overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(255,251,245,1),rgba(255,255,255,1))] dark:bg-[linear-gradient(180deg,rgba(39,39,42,0.7),rgba(9,9,11,0.2))]"
        >
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={`${title} thumbnail`}
              fill
              unoptimized
              className="object-cover"
              draggable={false}
            />
          ) : (
            <PreviewFrame
              src={`/preview/${owner}/${name}`}
              title={`${title} 预览`}
              className="h-full w-full"
              allowUpscale
              alignY="top"
              fitMode="cover"
              stageSize={{ width: 1200, height: 900 }}
            />
          )}
          <div
            className={`absolute inset-0 z-20 bg-linear-to-t from-black/80 via-black/28 to-transparent transition duration-200 ${
              expanded ? "opacity-0" : "opacity-0 group-hover:opacity-100"
            }`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-3 p-4 transition duration-200 ${
              expanded ? "opacity-0" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <div className="min-w-0">
              {visibility === "private" ? (
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/70">
                  Private
                </p>
              ) : null}
              <h2 className="line-clamp-2 text-base font-semibold text-white">
                {title}
              </h2>
            </div>
            {renderActionButtons()}
          </div>
        </motion.div>
      </article>

      <AnimatePresence>
        {expanded ? (
          <>
            <motion.button
              type="button"
              aria-label="关闭预览"
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.06 }}
              onClick={() => setExpanded(false)}
            />
            {renderFloatingActionButtons()}
            <motion.div
              className="pointer-events-none fixed inset-0 z-50 overflow-y-auto px-4 py-10 sm:px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="relative mx-auto max-w-5xl pointer-events-none">
                <motion.div
                  layoutId={cardLayoutId}
                  transition={layoutTransition}
                  className="pointer-events-auto flex h-[calc(100vh-144px)] min-h-[640px] flex-col overflow-hidden rounded-[28px] border border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="relative min-h-[360px] flex-[1_1_0%] overflow-hidden bg-[linear-gradient(180deg,rgba(255,251,245,1),rgba(255,255,255,1))] dark:bg-[linear-gradient(180deg,rgba(39,39,42,0.7),rgba(9,9,11,0.2))]">
                    <PreviewFrame
                      key={`expanded-preview-${owner}-${name}`}
                      src={`/preview/${owner}/${name}`}
                      title={`${title} 预览`}
                      className="h-full w-full"
                      allowUpscale
                      alignY="center"
                      fitMode="cover"
                      stageSize={{ width: 1200, height: 900 }}
                    />
                  </div>
                  <motion.div
                    className="shrink-0 border-t border-zinc-200/80 bg-white/96 px-5 py-5 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/96"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ ...overlayTransition, delay: 0.06 }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                            Registry UI
                          </span>
                          {visibility === "private" ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              Private
                            </span>
                          ) : null}
                        </div>
                        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-3xl dark:text-zinc-50">
                          {title}
                        </h2>
                        <p className="mt-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                          {owner} / {name}
                        </p>
                        {description ? (
                          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 sm:text-base dark:text-zinc-300">
                            {description}
                          </p>
                        ) : null}
                      </div>
                      <div className="relative z-40 flex shrink-0 items-center gap-2">
                        <Link
                          href={`/registry/${owner}/${name}`}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                          onClick={(event) => event.stopPropagation()}
                        >
                          展开详情
                          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} />
                        </Link>
                      </div>
                    </div>

                    {(detailData?.dependencies?.length ||
                      detailData?.registryDependencies?.length) ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          依赖：
                        </span>
                        {detailData.dependencies.map((dep) => (
                          <span
                            key={dep}
                            className="rounded-md bg-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {dep}
                          </span>
                        ))}
                        {detailData.registryDependencies.map((ref) => (
                          <span
                            key={ref}
                            className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                          >
                            {ref.startsWith("@") ? ref : `@${ref}`}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                      <div className="space-y-6">
                        <section className="space-y-3">
                          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                            用于项目
                          </h3>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                              shadcn CLI 安装
                            </p>
                            <code className="block break-all font-mono text-sm text-zinc-800 dark:text-zinc-200">
                              {installCommand}
                            </code>
                          </div>
                        </section>

                        {propsFromCode.length > 0 ? (
                          <section className="space-y-3">
                            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                              Props
                            </h3>
                            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
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
                                  {propsFromCode.map((prop) => (
                                    <TableRow
                                      key={prop.name}
                                      className="border-zinc-100 dark:border-zinc-800"
                                    >
                                      <TableCell className="font-mono text-zinc-800 dark:text-zinc-200">
                                        {prop.name}
                                      </TableCell>
                                      <TableCell className="font-mono text-zinc-600 dark:text-zinc-400">
                                        {prop.type}
                                      </TableCell>
                                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                                        {prop.optional ? "是" : "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </section>
                        ) : null}
                      </div>

                      <section className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                            代码
                          </h3>
                          {detailLoading ? (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                              加载中…
                            </span>
                          ) : detailError ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              {detailError}
                            </span>
                          ) : null}
                        </div>
                        <div className="grid overflow-hidden rounded-2xl border border-zinc-200 lg:grid-cols-[220px_minmax(0,1fr)] dark:border-zinc-800">
                          <div className="border-b border-zinc-200 bg-zinc-50/80 p-2 lg:max-h-[320px] lg:overflow-auto lg:border-b-0 lg:border-r dark:border-zinc-800 dark:bg-zinc-900/40">
                            {detailLoading ? (
                              <p className="px-2 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                                加载中…
                              </p>
                            ) : detailData?.files?.length ? (
                              <div className="space-y-1">
                                {detailData.files.map((file) => {
                                  const selected = file.path === preferredFile?.path;
                                  return (
                                    <button
                                      key={file.path}
                                      type="button"
                                      onClick={() => setSelectedPath(file.path)}
                                      className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                                        selected
                                          ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                                          : "text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                      }`}
                                    >
                                      <span className="block truncate font-mono text-xs">
                                        {file.path}
                                      </span>
                                      <span
                                        className={`mt-1 block text-[11px] ${
                                          selected
                                            ? "text-white/70 dark:text-zinc-600"
                                            : "text-zinc-400 dark:text-zinc-500"
                                        }`}
                                      >
                                        {file.type.replace("registry:", "")}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="px-2 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                                没有可显示的文件
                              </p>
                            )}
                          </div>
                          <div className="max-h-[320px] overflow-auto">
                            <CodeBlock
                              code={
                                detailLoading
                                  ? "// loading…"
                                  : code || "// source unavailable"
                              }
                              language={
                                preferredFile?.path?.endsWith(".css")
                                  ? "css"
                                  : preferredFile?.path?.endsWith(".json")
                                    ? "json"
                                    : "tsx"
                              }
                            />
                          </div>
                        </div>
                      </section>
                    </div>
                  </motion.div>
                </motion.div>
                {renderFloatingActionButtons()}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
