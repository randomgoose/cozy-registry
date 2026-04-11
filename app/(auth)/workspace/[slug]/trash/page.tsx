import { notFound } from "next/navigation";
import { getCachedAuthSession } from "@/lib/auth-session";
import { listProjectsForScope } from "@/lib/project-list";
import { getCachedWorkspaceRouteAccess } from "@/lib/workspace-route";
import { TrashProjectsPanel } from "@/app/components/TrashProjectsPanel";

export const dynamic = "force-dynamic";

export default async function WorkspaceTrashPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const session = await getCachedAuthSession();

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </a>{" "}
          to view this workspace trash.
        </p>
      </div>
    );
  }

  const access = await getCachedWorkspaceRouteAccess(session.user.id, slug);
  if (!access.org || !access.isMember) notFound();
  const org = access.org;

  const archivedProjects = await listProjectsForScope({
    userId: session.user.id,
    activeOrganizationId: org.id,
    status: "archived",
  });

  return (
    <TrashProjectsPanel
      initialProjects={archivedProjects}
      heading={`${org.name} trash`}
      description={`Archived projects from ${org.name} stay here until an owner or admin restores them.`}
    />
  );
}
