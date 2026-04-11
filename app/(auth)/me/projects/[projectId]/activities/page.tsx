import { notFound } from "next/navigation";

import { ActivityFeedSection } from "@/app/components/ActivityFeedSection";
import { getCachedAuthSession } from "@/lib/auth-session";
import { decodeActivityCursor, listRegistryActivities } from "@/lib/registry-activities";
import { getProjectIfAccessible } from "@/lib/project-permissions";

export const dynamic = "force-dynamic";

export default async function PersonalProjectActivitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { projectId } = await params;
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

  const project = await getProjectIfAccessible(session.user.id, projectId);
  if (!project || project.organizationId != null) notFound();

  const sp = await searchParams;
  const cursor = decodeActivityCursor(sp.cursor ?? null);
  const { items, nextCursor } = await listRegistryActivities({
    scope: { kind: "project", projectId },
    limit: 30,
    cursor,
  });

  const pathname = `/me/projects/${encodeURIComponent(projectId)}/activities`;

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
