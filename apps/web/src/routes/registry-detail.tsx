import { useLocation } from "@tanstack/react-router";
import { RegistryDetailPage } from "../components/registry";

export function RegistryDetailRoute() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const searchParams = new URLSearchParams(location.searchStr);
  const owner = decodeURIComponent(segments[1] ?? "");
  const name = decodeURIComponent(segments[2] ?? "");
  const version = searchParams.get("v");

  return <RegistryDetailPage owner={owner} name={name} version={version} />;
}
