import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { ProjectsPanel } from "../../dashboard/CollectionsPanel";

export const dynamic = "force-dynamic";

export default async function PersonalProjectsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </a>{" "}
          to manage your projects.
        </p>
      </div>
    );
  }

  const [ownerRow] = await db
    .select({ handle: user.handle })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  const registryOwner =
    ownerRow?.handle ?? session.user.email?.split("@")[0] ?? "owner";

  return (
    <ProjectsPanel
      registryOwner={registryOwner}
      scopeLabel="Personal"
      isOrgScope={false}
      projectsBasePath="/me/projects"
    />
  );
}
