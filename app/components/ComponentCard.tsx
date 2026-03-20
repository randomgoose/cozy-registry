"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getRegistryItemTypeLabel } from "@/lib/registry-types";
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
  visibility: "public" | "private";
}

export function ComponentCard({
  itemId,
  owner,
  name,
  title,
  description,
  type,
  visibility,
}: ComponentCardProps) {
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [collections, setCollections] = useState<
    Array<{ id: string; title: string; slug: string }>
  >([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const typeLabel = getRegistryItemTypeLabel(type);

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

  return (
    <article className="group overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative h-40 w-full overflow-hidden border-b border-zinc-200 bg-[linear-gradient(135deg,rgba(255,247,237,1),rgba(255,255,255,1)_50%,rgba(241,245,249,1))] dark:border-zinc-700 dark:bg-[linear-gradient(135deg,rgba(39,39,42,1),rgba(9,9,11,1))]">
        <PreviewFrame
          src={`/preview/${owner}/${name}`}
          title={`${title} 预览`}
          className="h-full w-full"
          allowUpscale={false}
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="rounded-full border border-white/80 bg-white/85 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-700 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200">
            {typeLabel}
          </span>
          <span className="rounded-full border border-white/80 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-zinc-600 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300">
            {visibility === "private" ? "Private" : "Public"}
          </span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            @{owner}/{name}
          </p>
          <h2 className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
            {description || "—"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button variant="outline" size="lg" className="shrink-0" onClick={handleCopy}>
            {copied ? "已复制" : "复制代码"}
          </Button>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger
              onClick={() => {
                void ensureCollectionsLoaded();
              }}
              render={<Button variant="outline" size="lg" className="shrink-0" />}
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
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 text-sm dark:border-zinc-700">
        <span className="text-zinc-500 dark:text-zinc-400">
          预览、复制代码、查看接入方式
        </span>
        <a
          href={`/registry/${owner}/${name}`}
          className="font-medium text-amber-700 transition group-hover:translate-x-0.5 hover:underline dark:text-amber-300"
        >
          查看详情 →
        </a>
      </div>
    </article>
  );
}
