import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProjectIfAccessible } from "@/lib/project-permissions";
import { getRegistryItemsByOrganizationId } from "@/lib/registry";
import { isUserOrganizationMember, resolveOrganizationBySlug } from "@/lib/registry-organization";
import { ProjectsPanel } from "../../../../dashboard/CollectionsPanel";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug: rawSlug, projectId } = await params;
  const slug = decodeURIComponent(rawSlug);
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </a>{" "}
          to manage projects.
        </p>
      </div>
    );
  }

  const org = await resolveOrganizationBySlug(slug);
  if (!org) notFound();
  const allowed = await isUserOrganizationMember(session.user.id, org.id);
  if (!allowed) notFound();

  const project = await getProjectIfAccessible(session.user.id, projectId);
  if (!project || project.organizationId !== org.id) {
    notFound();
  }

  const items = await getRegistryItemsByOrganizationId(org.id);

  const projectsBasePath = `/workspace/${encodeURIComponent(org.slug)}/projects`;
  const visibility = project.visibility === "public" ? "public" : "private";

  return (
    <ProjectsPanel
      items={items.map((i) => ({
        id: i.id,
        name: i.name,
        title: i.title,
        type: i.type,
      }))}
      scopeLabel={`${org.name} (@${org.slug})`}
      isOrgScope
      projectsBasePath={projectsBasePath}
      initialProjectId={projectId}
      initialProjectTitle={project.title}
      initialProjectSlug={project.slug}
      initialProjectVisibility={visibility}
    />
  );
}
