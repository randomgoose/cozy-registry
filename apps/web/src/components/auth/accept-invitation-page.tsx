import { useEffect, useMemo, useState } from "react";
import { fetchAuthControlSession, postAuthControl } from "../../lib/auth-control";

export function AcceptInvitationPage() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const invitationId = useMemo(
    () => new URLSearchParams(search).get("invitationId"),
    [search],
  );
  const [phase, setPhase] = useState<"loading" | "need-auth" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!invitationId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const session = await fetchAuthControlSession();
      if (cancelled) return;

      if (!session?.user) {
        setPhase("need-auth");
        return;
      }

      const { response, data } = await postAuthControl("/organization/accept-invitation", {
        invitationId,
      });

      if (!response.ok) {
        setPhase("error");
        setMessage((data?.message as string | undefined) || "Could not accept this invitation.");
        return;
      }

      window.location.replace("/dashboard");
    })();

    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  if (!invitationId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-sm text-red-600 dark:text-red-400">
          This invitation link is missing required information.
        </p>
        <a href="/dashboard" className="mt-4 text-sm text-blue-600 hover:underline dark:text-blue-400">
          Go to dashboard
        </a>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Accepting invitation…</p>
      </div>
    );
  }

  if (phase === "need-auth") {
    const callbackUrl = `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Sign in to accept</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Use the same email address this invitation was sent to.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <a
              href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign in
            </a>
            <a
              href={`/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              Create account
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <p className="max-w-md text-center text-sm text-red-600 dark:text-red-400">{message}</p>
      <a href="/dashboard" className="mt-4 text-sm text-blue-600 hover:underline dark:text-blue-400">
        Go to dashboard
      </a>
    </div>
  );
}
