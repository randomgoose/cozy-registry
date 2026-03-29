import { useParams } from "@tanstack/react-router";
import { DocsPage } from "../components/docs";

export function DocsDetailRoute() {
  const params = useParams({ from: "/docs/$slug" });
  return <DocsPage slug={params.slug} />;
}
