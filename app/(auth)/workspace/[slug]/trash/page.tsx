import { notFound } from "next/navigation";
import { getCachedAuthSession } from "@/lib/auth-session";
import { listProjectsForScope } from "@/lib/project-list";
import { listTrashArchivedResources } from "@/lib/trash-resources";
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

  const [archivedProjects, archivedResources] = await Promise.all([
    listProjectsForScope({
      userId: session.user.id,
      activeOrganizationId: org.id,
      status: "archived",
    }),
    listTrashArchivedResources({
      userId: session.user.id,
      activeOrganizationId: org.id,
    }),
  ]);

  return (
    <TrashProjectsPanel
      initialProjects={archivedProjects}
      initialResources={archivedResources}
      registryApiOwner={org.slug}
      heading={`${org.name} trash`}
      description={`Archived projects and resources in ${org.name}. Owners and admins can restore or permanently delete projects; organization owners and editors can do the same for archived resources.`}
    />
  );
}
