import { useParams } from "react-router-dom";
import { TeamScopedPage } from "../components/workspace";

export function TeamSettingsRoute() {
  const { orgSlug, teamSlug } = useParams();
  return (
    <TeamScopedPage
      orgSlug={orgSlug ?? ""}
      teamSlug={teamSlug ?? ""}
      section="settings"
    />
  );
}
