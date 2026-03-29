import { useParams } from "react-router-dom";
import { CompatRouteRedirect } from "../components/layout";

export function TeamCollectionsRoute() {
  const { orgSlug, teamSlug } = useParams();

  return (
    <CompatRouteRedirect
      to={`/t/${encodeURIComponent(orgSlug ?? "")}/${encodeURIComponent(teamSlug ?? "")}/projects`}
      title="Redirecting to team projects"
      description="Team collections are now exposed as project access groups. We’re opening the migrated team projects route."
    />
  );
}
