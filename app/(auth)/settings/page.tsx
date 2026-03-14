"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function SettingsPage() {
  const [session, setSession] = useState<{ user: { name?: string; email?: string } } | null>(null);
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name?: string | null; start?: string | null }>>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    authClient.getSession().then(({ data }) => setSession(data ?? null));
  }, []);

  useEffect(() => {
    if (!session) return;
    authClient.apiKey.list().then(({ data }) => {
      if (data?.apiKeys) setApiKeys(data.apiKeys);
      setLoading(false);
    });
  }, [session]);

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await authClient.apiKey.create({
        name: newKeyName.trim(),
      });
      if (error) {
        alert(error.message ?? "Failed to create key");
        return;
      }
      if (data?.key) {
        setNewKey(data.key);
        setNewKeyName("");
        if (data.id) {
          setApiKeys((prev) => [...prev, { id: data.id, name: data.name ?? null, start: data.start ?? null }]);
        }
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm("确定要删除此 Token？删除后无法恢复。")) return;
    const { error } = await authClient.apiKey.delete({ keyId: id });
    if (error) {
      alert(error.message ?? "Failed to delete");
      return;
    }
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          请先{" "}
          <Link href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            登录
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              ← 返回
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              我的组件
            </Link>
          </div>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {session.user?.email}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          设置
        </h1>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            API Token（用于 Figma Make）
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            创建 Token 后，在 Figma Make Connector 的 Additional headers 中添加：<br />
            <code className="mt-1 block rounded bg-zinc-100 px-2 py-1 font-mono text-xs dark:bg-zinc-800">
              Authorization: Bearer &lt;你的Token&gt;
            </code>
          </p>

          {newKey && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                新 Token 已创建，请立即复制保存（只显示一次）：
              </p>
              <code className="mt-2 block break-all rounded bg-amber-100 px-2 py-2 font-mono text-sm dark:bg-amber-900/50">
                {newKey}
              </code>
              <button
                type="button"
                onClick={() => setNewKey(null)}
                className="mt-2 text-sm text-amber-700 hover:underline dark:text-amber-300"
              >
                已保存，关闭
              </button>
            </div>
          )}

          <form onSubmit={handleCreateKey} className="mt-4 flex gap-2">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Token 名称，如 Figma Make"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
          ) : apiKeys.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {apiKeys.map((key) => (
                <li
                  key={key.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <div>
                    <span className="font-medium">{key.name || "未命名"}</span>
                    {key.start && (
                      <span className="ml-2 font-mono text-xs text-zinc-500">
                        {key.start}...
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteKey(key.id)}
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">暂无 Token</p>
          )}
        </section>

        <div className="mt-8">
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut();
              window.location.href = "/";
            }}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            退出登录
          </button>
        </div>
      </main>
    </div>
  );
}
