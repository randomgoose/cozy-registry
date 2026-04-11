import { ActivityFeedSection } from "@/app/components/ActivityFeedSection";
import { getCachedAuthSession } from "@/lib/auth-session";
import { decodeActivityCursor, listRegistryActivities } from "@/lib/registry-activities";

export const dynamic = "force-dynamic";

export default async function PersonalActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
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

  const sp = await searchParams;
  const cursor = decodeActivityCursor(sp.cursor ?? null);
  const { items, nextCursor } = await listRegistryActivities({
    scope: { kind: "personal", userId: session.user.id },
    limit: 30,
    cursor,
  });

  return (
    <ActivityFeedSection
      title="Personal activity"
      subtitle="Showing recent activity for your items."
      items={items}
      viewerUserId={session.user.id}
      pathname="/me/activities"
      nextCursor={nextCursor}
    />
  );
}
