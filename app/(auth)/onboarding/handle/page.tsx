"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ChooseHandlePage() {
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          window.location.href = "/sign-in";
          return;
        }
        const data = (await res.json()) as { user: { handle?: string | null } | null };
        if (data.user?.handle) {
          window.location.href = "/me";
          return;
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/me/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save username");
        return;
      }
      window.location.href = "/me";
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Choose your username
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This username will appear in links and component references, for example{" "}
          <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">
            @yourname/button
          </code>
          . It can&apos;t be changed yet after you set it.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label
              htmlFor="handle"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Username
            </label>
            <input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="alice"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Lowercase letters, numbers, `.`, `-`, and `_` only. Length 2-30, and it must start and end with a letter or number.
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving ? "Saving..." : "Save and continue"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Prefer to look around first?{" "}
          <Link href="/" className="underline">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
