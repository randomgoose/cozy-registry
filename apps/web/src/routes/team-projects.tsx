import { useParams } from "@tanstack/react-router";
import { TeamScopedPage } from "../components/workspace";

export function TeamProjectsRoute() {
  const params = useParams({ from: "/t/$orgSlug/$teamSlug/projects" });

  return (
    <TeamScopedPage
      orgSlug={params.orgSlug}
      teamSlug={params.teamSlug}
      section="projects"
    />
  );
}
