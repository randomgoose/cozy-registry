import { useEffect, useState } from "react";
import { fetchAuthControlMe, updateAuthControlHandle } from "../../lib/auth-control";

export function OnboardingHandlePage() {
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const profile = await fetchAuthControlMe();
        if (!profile?.user) {
          window.location.replace("/sign-in");
          return;
        }
        if (profile.user.handle) {
          window.location.replace("/dashboard");
          return;
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setError("");
    setSaving(true);
    try {
      const { response, data } = await updateAuthControlHandle(handle);
      if (!response.ok) {
        const message =
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : "Failed to save username";
        setError(message);
        return;
      }

      window.location.replace("/dashboard");
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
          .
        </p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Username
            </span>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="alice"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Lowercase letters, numbers, `.`, `-`, and `_` only. Length 2-30, and it must start and end with a letter or number.
          </p>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving ? "Saving..." : "Save and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
