import { useParams } from "react-router-dom";
import { ProjectDetailPage } from "../components/collections";

export function ProjectDetailRoute() {
  const { projectSlug } = useParams();
  return <ProjectDetailPage projectSlug={projectSlug ?? ""} />;
}
