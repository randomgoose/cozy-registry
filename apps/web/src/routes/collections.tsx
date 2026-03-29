import { CompatRouteRedirect } from "../components/layout";

export function CollectionsRoute() {
  return (
    <CompatRouteRedirect
      to="/projects"
      title="Redirecting to projects"
      description="Collections now live under the project model. We’re opening the migrated projects view for this compatibility route."
    />
  );
}
