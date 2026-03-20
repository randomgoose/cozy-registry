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
  const [selectedOwner, setSelectedOwner] = useState("all");

  const owners = Array.from(new Set(items.map((item) => item.owner))).sort();
  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = items.filter((item) => {
    const normalizedType = normalizeRegistryItemType(item.type);
    const matchesType =
      selectedType === "all" ? true : normalizedType === selectedType;
    const matchesOwner =
      selectedOwner === "all" ? true : item.owner === selectedOwner;
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

    return matchesType && matchesOwner && matchesQuery;
  });

  const publicCount = items.filter((item) => item.visibility === "public").length;
  const privateCount = items.length - publicCount;
  const hasFilters =
    normalizedQuery.length > 0 ||
    selectedType !== "all" ||
    selectedOwner !== "all";

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 bg-[radial-gradient(circle_at_top_left,_rgba(217,119,6,0.14),_transparent_30%),linear-gradient(135deg,#fff7ed_0%,#ffffff_45%,#f8fafc_100%)] px-6 py-8 dark:border-zinc-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.12),_transparent_30%),linear-gradient(135deg,rgba(24,24,27,1)_0%,rgba(9,9,11,1)_100%)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
                Discover Cozy registry
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                团队组件、模块和主题，在一个入口里浏览与复用
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                直接搜索名称、场景或 owner，快速找到能复制到项目里、也能被 AI 发现的 Cozy registry 资产。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/70">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  总条目
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {items.length}
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/70">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Public
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {publicCount}
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/70">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Private
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {privateCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.5fr)_220px_220px]">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              搜索
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 title、name、描述或 owner"
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500 dark:focus:bg-zinc-900 dark:focus:ring-amber-500/10"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              类型
            </span>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500 dark:focus:bg-zinc-900 dark:focus:ring-amber-500/10"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Owner
            </span>
            <select
              value={selectedOwner}
              onChange={(event) => setSelectedOwner(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-amber-500 dark:focus:bg-zinc-900 dark:focus:ring-amber-500/10"
            >
              <option value="all">全部 owner</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
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
                : "浏览全部 Cozy registry 资产。"}
            </p>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedType("all");
                setSelectedOwner("all");
              }}
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              清空筛选
            </button>
          ) : (
            <Link
              href="/publish"
              className="inline-flex items-center justify-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              发布新条目
            </Link>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-zinc-300 bg-zinc-50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
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
                  setSelectedOwner("all");
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
