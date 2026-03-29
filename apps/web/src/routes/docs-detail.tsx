import { useParams } from "react-router-dom";
import { DocsPage } from "../components/docs";

export function DocsDetailRoute() {
  const { slug } = useParams();
  return <DocsPage slug={slug ?? ""} />;
}
