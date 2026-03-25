import { headers } from "next/headers";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import {
  getRegistryItemsByTeamId,
  getRegistryItemsByUserId,
} from "@/lib/registry";
import { ComponentCard } from "@/app/components/ComponentCard";
import { FigmaPublishPromptCard } from "@/app/components/FigmaPublishPromptCard";
import { getThumbnailFromMeta } from "@/lib/thumbnail";
import { getWorkspaceContextForSession } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function normalizeVisibility(value: string): "public" | "private" {
  return value === "private" ? "private" : "public";
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </a>{" "}
          to view your items.
        </p>
      </div>
    );
  }

  const workspace = await getWorkspaceContextForSession(session);
  const activeTeam = workspace.activeTeam;
  const activeOrganization = workspace.activeOrganization;
  const items = activeTeam
    ? await getRegistryItemsByTeamId(activeTeam.id)
    : await getRegistryItemsByUserId(session.user.id);
  const [ownerRow] = await db
    .select({ handle: user.handle })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  const ownerHandle = ownerRow?.handle ?? session.user.email?.split("@")[0] ?? "owner";
  const publicCount = items.filter((item) => item.visibility === "public").length;
  const privateCount = items.length - publicCount;
  const latestItem = items[0] ?? null;
  const isTeamScope = !!activeTeam;
  const eyebrow = isTeamScope ? "Team space" : "Personal space";
  const title = isTeamScope ? activeTeam.name : "Your registry workspace";
  const description = isTeamScope
    ? `Shared registry assets for ${activeOrganization?.name ?? "your organization"} / ${activeTeam.name}.`
    : `Manage everything published under @${ownerHandle}.`;

  return (
    <>
      <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {title}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {isTeamScope ? (
                description
              ) : (
                <>
                  Manage everything published under{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    @{ownerHandle}
                  </span>
                  .
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {!isTeamScope ? (
              <Link
                href="/publish"
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                Publish new item
              </Link>
            ) : null}
            <Link
              href="/collections"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            >
              Open collections
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Total items
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {items.length}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Public
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {publicCount}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Private
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {privateCount}
            </p>
          </div>
        </div>

        {latestItem ? (
          <div className="mt-5 rounded-2xl bg-zinc-50/90 px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:text-zinc-400 dark:ring-zinc-800">
            Latest update: <span className="font-medium text-zinc-900 dark:text-zinc-100">{latestItem.title}</span>
          </div>
        ) : null}
      </section>

      {items.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-zinc-300 bg-white/60 p-6 pb-10 dark:border-zinc-700 dark:bg-zinc-900/30">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-zinc-700 dark:text-zinc-300">
              {isTeamScope
                ? "This team doesn’t have any published items yet."
                : "You haven’t published anything yet."}
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {isTeamScope
                ? "Team publishing will plug into this shared scope next. For now, you can start by organizing team collections."
                : "Start from the tool you already use. We’ll swap these placeholders with the final walkthrough images next."}
            </p>
          </div>

          {!isTeamScope ? (
            <div className="mt-8">
              <FigmaPublishPromptCard />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="relative">
              <ComponentCard
                itemId={item.id}
                owner={
                  item.ownerHandle ??
                  item.userId ??
                  activeOrganization?.slug ??
                  activeTeam?.id ??
                  "legacy"
                }
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
