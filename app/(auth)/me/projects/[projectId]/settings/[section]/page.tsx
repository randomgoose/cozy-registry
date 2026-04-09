import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getProjectIfAccessible,
  getUserProjectRole,
} from "@/lib/project-permissions";
import { ProjectSettingsPanel } from "../../../../../dashboard/ProjectSettingsPanel";

export const dynamic = "force-dynamic";

export default async function PersonalProjectSettingsSectionPage({
  params,
}: {
  params: Promise<{ projectId: string; section: string }>;
}) {
  const { projectId, section } = await params;

  if (section !== "general" && section !== "themes" && section !== "danger") {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) notFound();

  const project = await getProjectIfAccessible(session.user.id, projectId);
  if (!project || project.organizationId != null) notFound();

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
      canDeleteProject={role === "owner"}
      projectsBasePath="/me/projects"
      scopeLabel="your personal workspace"
      isOrgScope={false}
      initialSection={section}
    />
  );
}
