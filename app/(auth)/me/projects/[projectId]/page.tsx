import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProjectIfAccessible } from "@/lib/project-permissions";
import { getRegistryItemsByUserId } from "@/lib/registry";
import { ProjectsPanel } from "../../../dashboard/CollectionsPanel";

export const dynamic = "force-dynamic";

export default async function PersonalProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
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

  const project = await getProjectIfAccessible(session.user.id, projectId);
  if (!project || project.organizationId != null) {
    notFound();
  }

  const items = await getRegistryItemsByUserId(session.user.id);

  const visibility = project.visibility === "public" ? "public" : "private";

  return (
    <ProjectsPanel
      items={items.map((i) => ({
        id: i.id,
        name: i.name,
        title: i.title,
        type: i.type,
      }))}
      scopeLabel="Personal"
      isOrgScope={false}
      projectsBasePath="/me/projects"
      initialProjectId={projectId}
      initialProjectTitle={project.title}
      initialProjectSlug={project.slug}
      initialProjectVisibility={visibility}
    />
  );
}
