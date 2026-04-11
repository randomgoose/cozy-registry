import { notFound } from "next/navigation";

import { ActivityFeedSection } from "@/app/components/ActivityFeedSection";
import { getCachedAuthSession } from "@/lib/auth-session";
import { decodeActivityCursor, listRegistryActivities } from "@/lib/registry-activities";
import { getCachedWorkspaceRouteAccess } from "@/lib/workspace-route";

export const dynamic = "force-dynamic";

export default async function WorkspaceActivitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const session = await getCachedAuthSession();
  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-6">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </a>{" "}
          to view activity.
        </p>
      </div>
    );
  }

  const access = await getCachedWorkspaceRouteAccess(session.user.id, slug);
  if (!access.org || !access.isMember) notFound();
  const org = access.org;

  const sp = await searchParams;
  const cursor = decodeActivityCursor(sp.cursor ?? null);
  const { items, nextCursor } = await listRegistryActivities({
    scope: { kind: "organization", organizationId: org.id },
    limit: 30,
    cursor,
  });

  const pathname = `/workspace/${encodeURIComponent(org.slug)}/activities`;

  return (
    <ActivityFeedSection
      title="Workspace activities"
      subtitle={`Showing recent activity for ${org.name} workspace.`}
      items={items}
      viewerUserId={session.user.id}
      pathname={pathname}
      nextCursor={nextCursor}
    />
  );
}
