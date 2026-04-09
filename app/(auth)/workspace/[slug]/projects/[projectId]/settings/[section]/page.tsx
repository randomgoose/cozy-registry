import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getProjectIfAccessible,
  getUserProjectRole,
} from "@/lib/project-permissions";
import { getCachedWorkspaceRouteAccess } from "@/lib/workspace-route";
import { ProjectSettingsPanel } from "../../../../../../dashboard/ProjectSettingsPanel";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectSettingsSectionPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; section: string }>;
}) {
  const { slug: rawSlug, projectId, section } = await params;

  if (section !== "general" && section !== "themes" && section !== "danger") {
    notFound();
  }

  const slug = decodeURIComponent(rawSlug);
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) notFound();

  const access = await getCachedWorkspaceRouteAccess(session.user.id, slug);
  if (!access.org || !access.isMember) notFound();

  const project = await getProjectIfAccessible(session.user.id, projectId);
  if (!project || project.organizationId !== access.org.id) notFound();

  const role = await getUserProjectRole(session.user.id, projectId, project.ownerUserId);

  return (
    <ProjectSettingsPanel
      projectId={projectId}
      title={project.title}
      slug={project.slug}
      description={project.description}
      visibility={project.visibility === "public" ? "public" : "private"}
      namespaceKey={project.namespaceKey}
      defaultThemeResourceRefs={project.defaultThemeResourceRefs ?? []}
      canEditProject={role === "owner" || role === "admin" || role === "editor"}
      canDeleteProject={role === "owner" || role === "admin"}
      projectsBasePath={`/workspace/${encodeURIComponent(access.org.slug)}/projects`}
      scopeLabel={`${access.org.name} (@${access.org.slug})`}
      isOrgScope
      initialSection={section}
    />
  );
}
