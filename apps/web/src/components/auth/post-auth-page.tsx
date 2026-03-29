import { useEffect, useState } from "react";
import { fetchAuthControlMe, fetchAuthControlSession } from "../../lib/auth-control";

export function PostAuthPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await fetchAuthControlSession();
      if (cancelled) return;

      if (!session?.user?.id) {
        window.location.replace("/sign-in?callbackUrl=%2Fpost-auth");
        return;
      }

      const profile = await fetchAuthControlMe();
      if (!profile) {
        setError("Could not load your account after sign-in.");
        return;
      }
      window.location.replace(profile.user?.handle ? "/dashboard" : "/onboarding/handle");
    })().catch((nextError) => {
      if (!cancelled) {
        setError(nextError instanceof Error ? nextError.message : "Sign-in redirect failed");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Finishing sign-in
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          We&apos;re checking your profile and sending you to the right next step.
        </p>
        {error ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        )}
      </div>
    </div>
  );
}
