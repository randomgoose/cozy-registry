import { notFound } from "next/navigation";

import { ActivityFeedSection } from "@/app/components/ActivityFeedSection";
import { getCachedAuthSession } from "@/lib/auth-session";
import { decodeActivityCursor, listRegistryActivities } from "@/lib/registry-activities";
import { getProjectIfAccessible } from "@/lib/project-permissions";
import { getCachedWorkspaceRouteAccess } from "@/lib/workspace-route";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectActivitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug: rawSlug, projectId } = await params;
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

  const project = await getProjectIfAccessible(session.user.id, projectId);
  if (!project || project.organizationId !== org.id) notFound();

  const sp = await searchParams;
  const cursor = decodeActivityCursor(sp.cursor ?? null);
  const { items, nextCursor } = await listRegistryActivities({
    scope: { kind: "project", projectId },
    limit: 30,
    cursor,
  });

  const pathname = `/workspace/${encodeURIComponent(org.slug)}/projects/${encodeURIComponent(projectId)}/activities`;

  return (
    <ActivityFeedSection
      title="Project activity"
      subtitle={`Showing recent activity for project “${project.title}”.`}
      items={items}
      viewerUserId={session.user.id}
      pathname={pathname}
      nextCursor={nextCursor}
    />
  );
}
