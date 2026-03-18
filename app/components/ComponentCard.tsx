"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PreviewFrame } from "./PreviewFrame";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ComponentCardProps {
  itemId: string;
  owner: string;
  name: string;
  title: string;
  description: string | null;
  type: string;
}

export function ComponentCard({
  itemId,
  owner,
  name,
  title,
  description,
  type,
}: ComponentCardProps) {
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [collections, setCollections] = useState<Array<{ id: string; title: string; slug: string }>>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [adding, setAdding] = useState(false);

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

  async function ensureCollectionsLoaded() {
    if (collectionsLoading) return;
    if (collections.length > 0) return;
    setCollectionsLoading(true);
    try {
      const res = await fetch("/api/collections", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { collections?: Array<{ id: string; title: string; slug: string }> }
        | null;
      setCollections(Array.isArray(data?.collections) ? data!.collections! : []);
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
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? "Failed to add to collection");
        return;
      }
      setAddOpen(false);
      setSelectedCollectionId("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative h-40 w-full overflow-hidden rounded-t-xl border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
        <PreviewFrame
          src={`/preview/${owner}/${name}`}
          title={`${title} 预览`}
          className="h-full w-full"
          allowUpscale={false}
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
        <div className="flex shrink-0 flex-col gap-2">
          <Button
            variant="outline"
            size="lg"
            className="shrink-0"
            onClick={handleCopy}
          >
            {copied ? "已复制" : "复制代码"}
          </Button>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger
              onClick={() => {
                void ensureCollectionsLoaded();
              }}
              render={
                <Button variant="outline" size="lg" className="shrink-0" />
              }
            >
              加入 Collection
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>加入 Collection</DialogTitle>
              </DialogHeader>

              {collectionsLoading ? (
                <p className="text-sm text-zinc-500">加载中...</p>
              ) : collections.length === 0 ? (
                <p className="text-sm text-zinc-500">你还没有 Collections（先去 Collections 页面创建）</p>
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
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.slug})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="default"
                  disabled={!selectedCollectionId || adding || collectionsLoading || collections.length === 0}
                  onClick={addToCollection}
                >
                  {adding ? "加入中..." : "加入"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
