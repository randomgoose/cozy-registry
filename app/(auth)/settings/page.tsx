"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";

export default function SettingsPage() {
  const [session, setSession] = useState<{ user: { name?: string; email?: string } } | null>(null);
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name?: string | null; start?: string | null }>>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [collections, setCollections] = useState<Array<{ id: string; slug: string; title: string }>>([]);
  const [policyKeyId, setPolicyKeyId] = useState<string | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policy, setPolicy] = useState<{
    allowedCollectionIds: string[];
    allowedTypes: string[];
    allowPublicOutsideCollections: boolean;
  } | null>(null);

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

  useEffect(() => {
    if (!session) return;
    fetch("/api/collections", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const cols = (data?.collections ?? []) as Array<{ id: string; slug: string; title: string }>;
        setCollections(cols);
      })
      .catch(() => {});
  }, [session]);

  async function openPolicy(keyId: string) {
    setPolicyKeyId(keyId);
    setPolicyLoading(true);
    try {
      const res = await fetch(`/api/apikeys/${keyId}/policy`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | {
            policy:
              | {
                  allowedCollectionIds?: unknown;
                  allowedTypes?: unknown;
                  allowPublicOutsideCollections?: unknown;
                }
              | null;
          }
        | null;
      const p = data?.policy ?? null;
      setPolicy({
        allowedCollectionIds: Array.isArray(p?.allowedCollectionIds)
          ? (p.allowedCollectionIds as string[])
          : [],
        allowedTypes: Array.isArray(p?.allowedTypes)
          ? Array.from(
              new Set(
                (p.allowedTypes as string[]).map((value) =>
                  normalizeRegistryItemType(value),
                ),
              ),
            )
          : [REGISTRY_BLOCK_TYPE, REGISTRY_THEME_TYPE],
        allowPublicOutsideCollections: !!p?.allowPublicOutsideCollections,
      });
    } finally {
      setPolicyLoading(false);
    }
  }

  async function savePolicy() {
    if (!policyKeyId || !policy) return;
    setPolicySaving(true);
    try {
      const res = await fetch(`/api/apikeys/${policyKeyId}/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? "Failed to save policy");
        return;
      }
      setPolicyKeyId(null);
      setPolicy(null);
    } finally {
      setPolicySaving(false);
    }
  }

  async function clearPolicy() {
    if (!policyKeyId) return;
    if (!confirm("清除该 Token 的范围限制？清除后将恢复为默认：可访问你有权限访问的所有资源。")) return;
    setPolicySaving(true);
    try {
      const res = await fetch(`/api/apikeys/${policyKeyId}/policy`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? "Failed to clear policy");
        return;
      }
      // Reset UI to "unrestricted"
      setPolicy(null);
      setPolicyKeyId(null);
    } finally {
      setPolicySaving(false);
    }
  }

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
    <>
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
                  <div className="mt-1 text-xs text-zinc-500">
                    可用范围：可配置 Collections / 类型，用于限制 AI 能看到与使用的资源
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPolicy(key.id)}
                    className="text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                  >
                    配置范围
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteKey(key.id)}
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">暂无 Token</p>
        )}
      </section>

        {policyKeyId && (
          <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Token 可用范围配置
              </h2>
              <button
                type="button"
                onClick={() => {
                  setPolicyKeyId(null);
                  setPolicy(null);
                }}
                className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
              >
                关闭
              </button>
            </div>

            {policyLoading || !policy ? (
              <p className="mt-3 text-sm text-zinc-500">加载中...</p>
            ) : (
              <div className="mt-4 space-y-6">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    允许的资源类型
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    {[REGISTRY_BLOCK_TYPE, REGISTRY_UI_TYPE, REGISTRY_THEME_TYPE].map((t) => (
                      <label key={t} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={policy.allowedTypes.includes(t)}
                          onChange={(e) => {
                            setPolicy((p) => {
                              if (!p) return p;
                              const next = new Set(p.allowedTypes);
                              if (e.target.checked) next.add(t);
                              else next.delete(t);
                              return { ...p, allowedTypes: Array.from(next) };
                            });
                          }}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    允许访问的 Collections
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    只会列出/获取这些集合内的条目（除非开启“允许 public 不在集合内”）。
                  </p>
                  {collections.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">暂无 Collections（可先去 Dashboard 创建）</p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {collections.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={policy.allowedCollectionIds.includes(c.id)}
                            onChange={(e) => {
                              setPolicy((p) => {
                                if (!p) return p;
                                const next = new Set(p.allowedCollectionIds);
                                if (e.target.checked) next.add(c.id);
                                else next.delete(c.id);
                                return { ...p, allowedCollectionIds: Array.from(next) };
                              });
                            }}
                          />
                          <span className="truncate">{c.title}</span>
                          <span className="text-xs text-zinc-500">({c.slug})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={policy.allowPublicOutsideCollections}
                      onChange={(e) => setPolicy((p) => (p ? { ...p, allowPublicOutsideCollections: e.target.checked } : p))}
                    />
                    允许访问 public 条目（即使不在 allowlist collections 中）
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={policySaving}
                    onClick={savePolicy}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {policySaving ? "保存中..." : "保存"}
                  </button>
                  <button
                    type="button"
                    disabled={policySaving}
                    onClick={clearPolicy}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                  >
                    清除限制
                  </button>
                  <span className="text-xs text-zinc-500">
                    提示：MCP / AI 使用该 Token 时会被强制限制在这里配置的范围内。
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

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
    </>
  );
}
