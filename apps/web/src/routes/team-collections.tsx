import { useParams } from "@tanstack/react-router";
import { CompatRouteRedirect } from "../components/layout";

export function TeamCollectionsRoute() {
  const params = useParams({ from: "/t/$orgSlug/$teamSlug/collections" });

  return (
    <CompatRouteRedirect
      to={`/t/${encodeURIComponent(params.orgSlug)}/${encodeURIComponent(params.teamSlug)}/projects`}
      title="Redirecting to team projects"
      description="Team collections are now exposed as project access groups. We’re opening the migrated team projects route."
    />
  );
}
