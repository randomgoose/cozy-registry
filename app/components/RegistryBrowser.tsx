"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getRegistryItemTypeLabel,
  normalizeRegistryItemType,
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
} from "@/lib/registry-types";
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
};

interface RegistryBrowserProps {
  items: RegistryBrowserItem[];
  isSignedIn: boolean;
}

const TYPE_OPTIONS = [
  { value: "all", label: "全部类型" },
  { value: REGISTRY_BLOCK_TYPE, label: "Block" },
  { value: REGISTRY_UI_TYPE, label: "UI" },
  { value: REGISTRY_THEME_TYPE, label: "Theme" },
];

export function RegistryBrowser({
  items,
  isSignedIn,
}: RegistryBrowserProps) {
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = items.filter((item) => {
    const normalizedType = normalizeRegistryItemType(item.type);
    const matchesType =
      selectedType === "all" ? true : normalizedType === selectedType;
    const matchesQuery =
      normalizedQuery.length === 0
        ? true
        : [
            item.title,
            item.name,
            item.owner,
            item.description ?? "",
            getRegistryItemTypeLabel(item.type),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);

    return matchesType && matchesQuery;
  });

  const publicCount = items.filter((item) => item.visibility === "public").length;
  const privateCount = items.length - publicCount;
  const hasFilters =
    normalizedQuery.length > 0 ||
    selectedType !== "all";

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.5fr)_220px]">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              搜索
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 title、name、描述或 owner"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500 dark:focus:ring-amber-500/10"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              类型
            </span>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500 dark:focus:ring-amber-500/10"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {filteredItems.length} 个结果
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {hasFilters
                ? "当前结果已按关键词或筛选条件收敛。"
                : `浏览全部 Cozy registry 资产 · ${items.length} total / ${publicCount} public / ${privateCount} private`}
            </p>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedType("all");
              }}
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              清空筛选
            </button>
          ) : (
            <Link
              href="/publish"
              className="inline-flex items-center justify-center rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              发布新条目
            </Link>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900/20">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              没找到匹配的条目
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              试试调整关键词、切换类型，或者放宽 owner 条件。
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelectedType("all");
                }}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                重置筛选
              </button>
              <Link
                href={isSignedIn ? "/publish" : "/sign-in"}
                className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
              >
                {isSignedIn ? "发布一个新条目" : "登录后发布"}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => (
              <ComponentCard
                key={item.id}
                itemId={item.itemId}
                owner={item.owner}
                name={item.name}
                title={item.title}
                description={item.description}
                type={item.type}
                visibility={item.visibility}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
