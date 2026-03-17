"use client";

import { useState } from "react";
import Link from "next/link";

export default function PublishPage() {
  const [name, setName] = useState("");
  const [type, setType] = useState("registry:block");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/registry/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          title,
          description: description || null,
          content,
          visibility,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("请先登录");
        }
        throw new Error(data.error || "Failed to publish");
      }

      setStatus("success");
      const ownerId = data?.item?.userId ?? "legacy";
      // Prefer public handle for nicer URLs; fallback to internal id.
      let owner = ownerId;
      try {
        const me = await fetch("/api/me");
        if (me.ok) {
          const meData = (await me.json()) as { user?: { handle?: string | null } | null };
          if (meData.user?.handle) owner = meData.user.handle;
        }
      } catch {
        // ignore
      }
      window.location.href = `/registry/${owner}/${name}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            ← 返回
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          发布组件
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          粘贴 TSX 代码、填写元数据、发布到 Registry。需先{" "}
          <Link href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            登录
          </Link>
          。
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              名称 (kebab-case) *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-component"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <p className="mt-1 text-xs text-zinc-500">
              仅小写字母、数字和连字符，如 hero-section
            </p>
          </div>

          <div>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              类型 *
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="registry:block">Block (模块)</option>
              <option value="registry:component">Component (组件)</option>
              <option value="registry:theme">Theme (主题)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              标题 *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Component"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="visibility"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              可见性
            </label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "public" | "private")}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="public">公开 - 所有人可访问</option>
              <option value="private">私有 - 仅本人（需 Bearer Token）可访问</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              私有组件需在 MCP/Figma Make 中配置 Bearer Token 才能访问
            </p>
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              描述
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="组件的用途和适用场景..."
              rows={2}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {type === "registry:theme" ? "CSS 代码 *" : "TSX 代码 *"}
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                type === "registry:theme"
                  ? `:root {
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --radius-md: 0.5rem;
  --spacing-unit: 0.25rem;
}`
                  : `"use client";

import React from "react";

export function MyComponent({ title }: { title: string }) {
  return <div>{title}</div>;
}`
              }
              required
              rows={16}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-zinc-50 font-mono text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {status === "success" && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              发布成功！{" "}
              <Link href="/" className="font-medium underline">
                查看组件列表
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {status === "loading" ? "发布中..." : "发布"}
          </button>
        </form>
      </main>
    </div>
  );
}
