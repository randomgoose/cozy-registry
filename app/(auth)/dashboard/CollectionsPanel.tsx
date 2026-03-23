"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CollectionsPanel(props: { items: ItemSummary[]; className?: string }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

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
      setSlugManuallyEdited(false);
      setCreateOpen(false);
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
        Organize blocks, components, and themes into reusable groups, and use collections to scope what AI tools can access.
      </p>

      <div className="mt-4">
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) {
              setCreating(false);
              setNewTitle("");
              setNewSlug("");
              setSlugManuallyEdited(false);
            }
          }}
        >
          <DialogTrigger
            render={
              <button
                type="button"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              />
            }
          >
            New collection
          </DialogTrigger>
          <DialogContent className="max-w-md gap-5 px-5 pt-5 pb-5">
            <DialogHeader>
              <DialogTitle>Create collection</DialogTitle>
              <DialogDescription>
                Give the collection a name first. We will generate the slug for you, and you can still fine-tune it before saving.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={createCollection} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                  Title
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    setNewTitle(nextTitle);
                    if (!slugManuallyEdited) {
                      setNewSlug(slugify(nextTitle));
                    }
                  }}
                  placeholder="Marketing Blocks"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                  Slug
                </label>
                <input
                  value={newSlug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setNewSlug(slugify(e.target.value));
                  }}
                  placeholder="marketing-blocks"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Used in URLs and MCP scopes. Kebab-case only.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim() || !newSlug.trim()}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {creating ? "Creating..." : "Create collection"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading...</p>
      ) : collections.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No collections yet.</p>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Your collections
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
                    {c.slug} · {c.visibility === "private" ? "Private" : "Public"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {!selectedId ? (
              <p className="text-sm text-zinc-500">Select a collection to view and manage its items.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={addItemId}
                    onChange={(e) => setAddItemId(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">Choose an item to add…</option>
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
                    Add
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Collection Items
                  </div>
                  {itemsLoading ? (
                    <p className="mt-2 text-sm text-zinc-500">Loading...</p>
                  ) : collectionItems.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">No items yet.</p>
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
                            Remove
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
