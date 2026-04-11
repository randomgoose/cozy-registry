import { eq } from "drizzle-orm";
import { getCachedAuthSession } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { listProjectsForScope } from "@/lib/project-list";
import { TrashProjectsPanel } from "@/app/components/TrashProjectsPanel";

export const dynamic = "force-dynamic";

export default async function PersonalTrashPage() {
  const session = await getCachedAuthSession();

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </a>{" "}
          to view your trash.
        </p>
      </div>
    );
  }

  const [ownerRow] = await db
    .select({ handle: user.handle })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  const registryOwner = ownerRow?.handle ?? session.user.email?.split("@")[0] ?? "owner";
  const archivedProjects = await listProjectsForScope({
    userId: session.user.id,
    activeOrganizationId: null,
    status: "archived",
  });

  return (
    <TrashProjectsPanel
      initialProjects={archivedProjects}
      heading="Personal trash"
      description={`Archived projects from @${registryOwner} live here until you restore them.`}
    />
  );
}
