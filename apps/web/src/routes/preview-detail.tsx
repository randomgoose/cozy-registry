import { useLocation } from "react-router-dom";
import { PreviewPage } from "../components/preview";

export function PreviewDetailRoute() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const searchParams = new URLSearchParams(location.search);
  const owner = decodeURIComponent(segments[1] ?? "");
  const name = decodeURIComponent(segments[2] ?? "");
  const version = searchParams.get("v");

  return <PreviewPage owner={owner} name={name} version={version} />;
}
