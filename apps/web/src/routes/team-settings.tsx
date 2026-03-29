import { useParams } from "@tanstack/react-router";
import { TeamScopedPage } from "../components/workspace";

export function TeamSettingsRoute() {
  const params = useParams({ from: "/t/$orgSlug/$teamSlug/settings" });
  return (
    <TeamScopedPage
      orgSlug={params.orgSlug}
      teamSlug={params.teamSlug}
      section="settings"
    />
  );
}
