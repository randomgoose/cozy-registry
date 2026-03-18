"use client";

import { useEffect, useMemo, useState } from "react";

type ItemSummary = {
  id: string;
  name: string;
  title: string;
  type: string;
};

type Collection = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  itemCount?: number;
};

type CollectionItem = {
  itemId: string;
  name: string;
  title: string;
  type: string;
  visibility: string;
  addedAt: string;
};

export function CollectionsPanel(props: { items: ItemSummary[]; className?: string }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [addItemId, setAddItemId] = useState<string>("");

  const availableToAdd = useMemo(() => {
    const existing = new Set(collectionItems.map((x) => x.itemId));
    return props.items.filter((i) => !existing.has(i.id));
  }, [collectionItems, props.items]);

  async function refreshCollections() {
    const res = await fetch("/api/collections", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load collections");
    const data = (await res.json()) as { collections: Collection[] };
    setCollections(data.collections ?? []);
  }

  async function refreshSelectedItems(id: string) {
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/collections/${id}/items`, { cache: "no-store" });
      const data = (await res.json()) as { items: CollectionItem[] };
      setCollectionItems(data.items ?? []);
    } finally {
      setItemsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshCollections();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    refreshSelectedItems(selectedId).catch(() => {});
  }, [selectedId]);

  async function createCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlug.trim() || !newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newSlug.trim(),
          title: newTitle.trim(),
          visibility: "private",
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? "Failed to create collection");
        return;
      }
      setNewSlug("");
      setNewTitle("");
      await refreshCollections();
    } finally {
      setCreating(false);
    }
  }

  async function addItem() {
    if (!selectedId || !addItemId) return;
    const res = await fetch(`/api/collections/${selectedId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: addItemId }),
    });
    if (!res.ok) {
      alert("Failed to add item");
      return;
    }
    setAddItemId("");
    await refreshCollections();
    await refreshSelectedItems(selectedId);
  }

  async function removeItem(itemId: string) {
    if (!selectedId) return;
    const res = await fetch(`/api/collections/${selectedId}/items/${itemId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Failed to remove item");
      return;
    }
    await refreshCollections();
    await refreshSelectedItems(selectedId);
  }

  return (
    <section className={props.className ?? ""}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Collections
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        用 Collections 把 block/component/theme 组织成可管理的集合，并可用于限制 AI Token 的可见范围。
      </p>

      <form onSubmit={createCollection} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          placeholder="slug（kebab-case），如 marketing"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="标题，如 Marketing Blocks"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {creating ? "创建中..." : "创建"}
        </button>
      </form>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">加载中...</p>
      ) : collections.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">暂无 Collections</p>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              我的 Collections
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                    selectedId === c.id
                      ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-xs text-zinc-500">
                      {c.itemCount ?? 0}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {c.slug} · {c.visibility === "private" ? "私有" : "公开"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {!selectedId ? (
              <p className="text-sm text-zinc-500">选择一个 Collection 查看与管理条目。</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={addItemId}
                    onChange={(e) => setAddItemId(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">选择要添加的条目…</option>
                    {availableToAdd.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title} ({i.type})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={!addItemId}
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    添加
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Collection Items
                  </div>
                  {itemsLoading ? (
                    <p className="mt-2 text-sm text-zinc-500">加载中...</p>
                  ) : collectionItems.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">暂无条目</p>
                  ) : (
                    <ul className="mt-2 max-h-[45vh] space-y-2 overflow-auto pr-1">
                      {collectionItems.map((it) => (
                        <li
                          key={it.itemId}
                          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {it.title}
                            </div>
                            <div className="truncate text-xs text-zinc-500">
                              {it.name} · {it.type}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(it.itemId)}
                            className="text-sm text-red-600 hover:underline dark:text-red-400"
                          >
                            移除
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

