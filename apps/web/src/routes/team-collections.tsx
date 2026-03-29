import { useParams } from "@tanstack/react-router";
import { TeamScopedPage } from "../components/workspace";

export function TeamCollectionsRoute() {
  const params = useParams({ from: "/t/$orgSlug/$teamSlug/collections" });
  return (
    <TeamScopedPage
      orgSlug={params.orgSlug}
      teamSlug={params.teamSlug}
      section="collections"
    />
  );
}
