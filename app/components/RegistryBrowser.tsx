"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getRegistryItemTypeLabel } from "@/lib/registry-types";
import { ComponentCard } from "./ComponentCard";

type RegistryBrowserItem = {
  id: string;
  itemId: string;
  owner: string;
  name: string;
  title: string;
  description: string | null;
  type: string;
  visibility: "public" | "private";
  thumbnailUrl?: string | null;
};

interface RegistryBrowserProps {
  items: RegistryBrowserItem[];
  isSignedIn: boolean;
}

const INITIAL_VISIBLE_COUNT = 12;
const LOAD_MORE_COUNT = 8;

export function RegistryBrowser({
  items,
  isSignedIn,
}: RegistryBrowserProps) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  const indexedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        searchText: [
          item.title,
          item.name,
          item.owner,
          item.description ?? "",
          getRegistryItemTypeLabel(item.type),
        ]
          .join(" ")
          .toLowerCase(),
      })),
    [items],
  );

  const { filteredItems, publicCount, privateCount } = useMemo(() => {
    const publicCount = items.filter((item) => item.visibility === "public").length;
    const privateCount = items.length - publicCount;
    const filteredItems =
      normalizedQuery.length === 0
        ? indexedItems
        : indexedItems.filter((item) => item.searchText.includes(normalizedQuery));

    return {
      filteredItems,
      publicCount,
      privateCount,
    };
  }, [indexedItems, items, normalizedQuery]);

  const hasFilters = normalizedQuery.length > 0;
  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMore = visibleItems.length < filteredItems.length;

  useEffect(() => {
    if (!hasMore) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry?.isIntersecting) return;
        setVisibleCount((current) =>
          Math.min(current + LOAD_MORE_COUNT, filteredItems.length),
        );
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredItems.length, hasMore]);

  return (
    <div className="space-y-6">
      <section>
        <label className="block">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(INITIAL_VISIBLE_COUNT);
            }}
            placeholder="Search title, name, description, or owner"
            className="w-full rounded-[22px] border border-zinc-200/80 bg-white/90 px-5 py-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500 dark:focus:ring-amber-500/10"
          />
        </label>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {hasFilters
                ? `Showing ${visibleItems.length} of ${filteredItems.length} filtered results.`
                : `Browse all Cozy registry items · ${items.length} total / ${publicCount} public / ${privateCount} private`}
            </p>
          </div>
          {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                }}
                className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
              >
              Clear search
            </button>
          ) : null}
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900/20">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              No matching items
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Try different keywords, a type filter, or a broader owner filter.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                }}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Reset search
              </button>
              <Link
                href={isSignedIn ? "/publish" : "/sign-in"}
                className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
              >
                {isSignedIn ? "Publish a new item" : "Sign in to publish"}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {visibleItems.map((item) => (
                <ComponentCard
                  key={item.id}
                  itemId={item.itemId}
                  owner={item.owner}
                  name={item.name}
                  title={item.title}
                  description={item.description}
                  visibility={item.visibility}
                  thumbnailUrl={item.thumbnailUrl}
                />
              ))}
            </div>
            {hasMore ? (
              <div
                ref={loadMoreRef}
                className="flex items-center justify-center py-6 text-sm text-zinc-500 dark:text-zinc-400"
              >
                Loading more items...
              </div>
            ) : filteredItems.length > INITIAL_VISIBLE_COUNT ? (
              <div className="flex items-center justify-center py-4 text-sm text-zinc-400 dark:text-zinc-500">
                You’ve reached the end.
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
