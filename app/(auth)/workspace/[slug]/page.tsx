import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedAuthSession } from "@/lib/auth-session";
import { getRegistryItemsByOrganizationId } from "@/lib/registry";
import { ComponentCard } from "@/app/components/ComponentCard";
import { getThumbnailFromMeta } from "@/lib/thumbnail";
import { createServerTimingLogger, timeAsync } from "@/lib/server-timing";
import { getCachedWorkspaceRouteAccess } from "@/lib/workspace-route";

export const dynamic = "force-dynamic";

function normalizeVisibility(value: string): "public" | "private" {
  return value === "private" ? "private" : "public";
}

export default async function WorkspaceItemsPage({ params }: { params: Promise<{ slug: string }> }) {
  const timings = createServerTimingLogger("workspace-items-page");
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const session = await timeAsync(timings, "sessionLookup", async () =>
    getCachedAuthSession(),
  );

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </a>{" "}
          to view this workspace.
        </p>
      </div>
    );
  }

  const access = await timeAsync(timings, "workspaceAccessLoad", async () =>
    getCachedWorkspaceRouteAccess(session.user.id, slug),
  );
  if (!access.org) {
    timings.flush({
      slug,
      userId: session.user.id,
      outcome: "org-not-found",
      accessTimingsMs: access.timingsMs,
    });
    notFound();
  }
  if (!access.isMember) {
    timings.flush({
      slug,
      userId: session.user.id,
      outcome: "membership-denied",
      accessTimingsMs: access.timingsMs,
    });
    notFound();
  }

  const org = access.org;

  const items = await timeAsync(timings, "registryItemLoad", async () =>
    getRegistryItemsByOrganizationId(org.id),
  );
  const publicCount = items.filter((item) => item.visibility === "public").length;
  const privateCount = items.length - publicCount;
  const latestItem = items[0] ?? null;
  const base = `/workspace/${encodeURIComponent(org.slug)}`;
  timings.flush({
    slug: org.slug,
    organizationId: org.id,
    userId: session.user.id,
    itemCount: items.length,
    outcome: "ok",
    accessTimingsMs: access.timingsMs,
  });

  return (
    <>
      <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Organization
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {org.name}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Shared registry assets for {org.name} (@{org.slug}).
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`${base}/projects`}
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            >
              Open projects
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Total items
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{items.length}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Public
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{publicCount}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Private
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{privateCount}</p>
          </div>
        </div>

        {latestItem ? (
          <div className="mt-5 rounded-2xl bg-zinc-50/90 px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:text-zinc-400 dark:ring-zinc-800">
            Latest update:{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{latestItem.title}</span>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Install & upgrades (engineers)
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            After installing a block from this registry into a repo, the project should contain{" "}
            <code className="rounded bg-zinc-200/80 px-1 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              cozy-registry.lock.json
            </code>
            . Use the Cozy registry MCP in your editor or agent:{" "}
            <span className="text-zinc-800 dark:text-zinc-200">
              get_project_registry_status
            </span>
            ,{" "}
            <span className="text-zinc-800 dark:text-zinc-200">analyze_project_registry</span>,{" "}
            <span className="text-zinc-800 dark:text-zinc-200">plan_component_upgrade</span>,{" "}
            <span className="text-zinc-800 dark:text-zinc-200">upgrade_component_in_project</span>.
            Before publishing from tools,{" "}
            <span className="text-zinc-800 dark:text-zinc-200">diagnose_publish_readiness</span> returns
            structured validation without writing to the registry.
          </p>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-zinc-300 bg-white/60 p-6 pb-10 dark:border-zinc-700 dark:bg-zinc-900/30">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-zinc-700 dark:text-zinc-300">
              This organization doesn’t have any published items yet.
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Publish from your tools using the organization target, or group items into projects.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="relative">
              <ComponentCard
                itemId={item.id}
                owner={
                  (item as { orgSlug?: string | null }).orgSlug ?? org.slug ?? "legacy"
                }
                project={(item as { canonicalProjectKey?: string | null }).canonicalProjectKey ?? null}
                name={item.name}
                title={item.title}
                description={item.description}
                visibility={normalizeVisibility(item.visibility)}
                thumbnailUrl={getThumbnailFromMeta(item.meta)?.url ?? null}
              />
              <span
                className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-medium ${
                  item.visibility === "private"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {item.visibility === "private" ? "Private" : "Public"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
