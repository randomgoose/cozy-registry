import Link from "next/link";
import { getCachedAuthSession } from "@/lib/auth-session";
import { getWorkspaceContextForSession } from "@/lib/workspace-context";
import { OrganizationsHubScopeSync } from "./OrganizationsHubScopeSync";

export const dynamic = "force-dynamic";

export default async function OrganizationsHubPage() {
  const session = await getCachedAuthSession();

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <Link href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </Link>{" "}
          to view organizations.
        </p>
      </div>
    );
  }

  const workspace = await getWorkspaceContextForSession(session);

  return (
    <div className="space-y-6">
      <OrganizationsHubScopeSync />
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Organizations</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Open an organization workspace to manage shared registry items, projects, and members. Use the
          sidebar to create a new organization or jump between workspaces.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href="/me"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
          >
            ← Back to personal registry
          </Link>
        </p>
      </div>

      {workspace.organizations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
          <p className="text-zinc-700 dark:text-zinc-300">You are not a member of any organization yet.</p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Create one from the sidebar while browsing your personal space.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {workspace.organizations.map((org) => (
            <li key={org.id}>
              <Link
                href={`/workspace/${encodeURIComponent(org.slug)}`}
                className="block rounded-2xl border border-zinc-200/80 bg-white/90 p-5 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-zinc-700"
              >
                <div className="text-[13px] font-semibold text-zinc-950 dark:text-zinc-50">{org.name}</div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">@{org.slug}</div>
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                  {org.role === "owner" ? "Owner" : org.role === "editor" ? "Editor" : "Viewer"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
