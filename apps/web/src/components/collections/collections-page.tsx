import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FolderKanban, Lock, Sparkles, Trash2 } from "lucide-react";
import {
  createCollection,
  deleteCollection,
  fetchCollectionItems,
  fetchCollections,
  fetchCurrentWorkspace,
  removeItemFromCollection,
  type Collection,
  type CollectionItem,
  updateCollection,
  type WorkspaceData,
} from "../../lib/platform";
import { getPlatformBaseUrl } from "../../lib/runtime-config";
import { AppShellLite } from "../layout/app-shell-lite";

function slugifyCollectionName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CollectionsPage() {
  const platformBaseUrl = getPlatformBaseUrl();
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<CollectionItem[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "error">(
    platformBaseUrl ? "loading" : "error",
  );
  const [itemsLoading, setItemsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    description: "",
    visibility: "private" as "public" | "private",
  });
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    visibility: "private" as "public" | "private",
  });

  async function loadCollections(signal?: AbortSignal) {
    const [workspaceData, collectionData] = await Promise.all([
      fetchCurrentWorkspace(signal),
      fetchCollections(signal),
    ]);

    if (!workspaceData || !collectionData) {
      setStatus("signed-out");
      return;
    }

    setWorkspace(workspaceData);
    setCollections(collectionData);
    setSelectedCollectionId((currentId) =>
      collectionData.some((collection) => collection.id === currentId)
        ? currentId
        : collectionData[0]?.id ?? null,
    );
    setStatus("ready");
  }

  useEffect(() => {
    const controller = new AbortController();

    if (!platformBaseUrl) {
      return () => controller.abort();
    }

    loadCollections(controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load collections page", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, [platformBaseUrl]);

  useEffect(() => {
    if (!selectedCollectionId) {
      setSelectedItems([]);
      return;
    }

    const controller = new AbortController();
    setItemsLoading(true);

    fetchCollectionItems(selectedCollectionId, controller.signal)
      .then((items) => {
        setSelectedItems(items ?? []);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load selected collection items", error);
        setSelectedItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setItemsLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedCollectionId]);

  const selectedCollection = useMemo(
    () => collections?.find((collection) => collection.id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId],
  );

  useEffect(() => {
    if (!selectedCollection) {
      setEditDraft({
        title: "",
        description: "",
        visibility: "private",
      });
      return;
    }

    setEditDraft({
      title: selectedCollection.title,
      description: selectedCollection.description ?? "",
      visibility: selectedCollection.visibility,
    });
  }, [selectedCollection]);

  async function handleCreateCollection(event: React.FormEvent) {
    event.preventDefault();
    const title = createDraft.title.trim();
    if (!title || saving) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await createCollection({
        title,
        slug: slugifyCollectionName(title),
        description: createDraft.description.trim() || null,
        visibility: createDraft.visibility,
      });

      if (!response.response.ok) {
        setMessage((response.data?.error as string | undefined) ?? "Failed to create collection.");
        return;
      }

      await loadCollections();
      setCreateDraft({
        title: "",
        description: "",
        visibility: "private",
      });
      setMessage("Collection created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create collection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCollection(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCollection || saving) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await updateCollection(selectedCollection.id, {
        title: editDraft.title.trim(),
        slug: slugifyCollectionName(editDraft.title),
        description: editDraft.description.trim() || null,
        visibility: editDraft.visibility,
      });

      if (!response.response.ok) {
        setMessage((response.data?.error as string | undefined) ?? "Failed to update collection.");
        return;
      }

      await loadCollections();
      setMessage("Collection updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update collection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCollection() {
    if (!selectedCollection || saving) return;
    const confirmed = window.confirm(
      `Delete "${selectedCollection.title}"? This also removes its saved item list.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await deleteCollection(selectedCollection.id);

      if (!response.response.ok) {
        setMessage((response.data?.error as string | undefined) ?? "Failed to delete collection.");
        return;
      }

      await loadCollections();
      setSelectedItems([]);
      setMessage("Collection deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete collection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!selectedCollection || saving) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await removeItemFromCollection(selectedCollection.id, itemId);

      if (!response.response.ok) {
        setMessage((response.data?.error as string | undefined) ?? "Failed to remove item.");
        return;
      }

      const [nextItems, nextCollections] = await Promise.all([
        fetchCollectionItems(selectedCollection.id),
        fetchCollections(),
      ]);
      setSelectedItems(nextItems ?? []);
      if (nextCollections) {
        setCollections(nextCollections);
      }
      setMessage("Item removed from collection.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to remove item.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "signed-out") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="max-w-md rounded-[28px] border border-zinc-200 bg-white/92 p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <Lock className="mx-auto size-8 text-zinc-400 dark:text-zinc-500" />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Sign in to manage collections
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Sign in through the migrated control plane to manage collections.
          </p>
          <div className="mt-6">
            <a
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Continue to sign in
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="max-w-2xl rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          Collections could not reach the extracted platform APIs. Make sure <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">VITE_COZY_PLATFORM_BASE_URL</code> points at a running <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">cozy-platform</code> host.
        </div>
      </div>
    );
  }

  return (
    <AppShellLite
      title={workspace?.workspace?.name ?? "Workspace"}
      subtitle="Collections are now fully manageable in the new host, including create, edit, delete, and item removal."
      activeNav="collections"
    >
      <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Collection browser
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Organize reusable item groups
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Browse the collections available in your current workspace scope and manage them directly from the migrated host.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Collections
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {collections?.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Teams
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {workspace?.teams.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Pending invites
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {workspace?.invitations.length ?? 0}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <form onSubmit={handleCreateCollection} className="mb-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Create collection
            </div>
            <input
              value={createDraft.title}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Favorites"
              className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <textarea
              value={createDraft.description}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="A short description for this collection"
              className="mt-3 min-h-24 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <select
              value={createDraft.visibility}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  visibility: event.target.value as "public" | "private",
                }))
              }
              className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
            <button
              type="submit"
              disabled={saving || !createDraft.title.trim()}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving…" : "Create collection"}
            </button>
          </form>

          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            <FolderKanban className="size-4" />
            Available collections
          </div>
          <div className="mt-4 space-y-2">
            {(collections ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No collections yet.
              </p>
            ) : (
              collections?.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => setSelectedCollectionId(collection.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedCollectionId === collection.id
                      ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{collection.title}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {collection.itemCount ?? 0}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {collection.slug} · {collection.visibility === "private" ? "Private" : "Public"}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          {!selectedCollection ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a collection to inspect its items.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Selected collection
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {selectedCollection.title}
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {selectedCollection.description || "No description yet."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteCollection()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="size-4" />
                  Delete collection
                </button>
              </div>

              <form
                onSubmit={handleUpdateCollection}
                className="mt-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
              >
                <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  Edit collection
                </div>
                <input
                  value={editDraft.title}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <textarea
                  value={editDraft.description}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  className="mt-3 min-h-24 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <select
                  value={editDraft.visibility}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      visibility: event.target.value as "public" | "private",
                    }))
                  }
                  className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
                <button
                  type="submit"
                  disabled={saving || !editDraft.title.trim()}
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </form>

              {message ? (
                <p className="mt-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
                  {message}
                </p>
              ) : null}

              <div className="mt-6">
                {itemsLoading ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading collection items...</p>
                ) : (selectedItems?.length ?? 0) === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    This collection does not contain any items yet.
                  </p>
                ) : (
                  <>
                    <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                      <Sparkles className="size-4" />
                      Items are being read through the extracted collections API surface.
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {selectedItems?.map((item) => (
                        <article
                          key={item.itemId}
                          className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                                {item.type}
                              </p>
                              <h3 className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                                {item.title}
                              </h3>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                item.visibility === "private"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                              }`}
                            >
                              {item.visibility === "private" ? "Private" : "Public"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                            {item.description || "No description yet."}
                          </p>
                          <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                            <span>{item.name}</span>
                            <div className="flex items-center gap-3">
                              <a
                                href={`/registry/${item.name}`}
                                className="inline-flex items-center gap-1 font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
                              >
                                View item
                                <ArrowRight className="size-3.5" />
                              </a>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void handleRemoveItem(item.itemId)}
                                className="inline-flex items-center gap-1 font-medium text-red-600 transition hover:text-red-700 disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </AppShellLite>
  );
}
