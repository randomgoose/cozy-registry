import { useParams } from "@tanstack/react-router";
import { TeamScopedPage } from "../components/workspace";

export function TeamDashboardRoute() {
  const params = useParams({ from: "/t/$orgSlug/$teamSlug/dashboard" });
  return (
    <TeamScopedPage
      orgSlug={params.orgSlug}
      teamSlug={params.teamSlug}
      section="dashboard"
    />
  );
}
