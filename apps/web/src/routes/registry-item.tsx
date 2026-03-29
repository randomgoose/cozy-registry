import { useLocation } from "react-router-dom";
import { RegistryLookupPage } from "../components/registry";

export function RegistryItemRoute() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const itemName = decodeURIComponent(segments[1] ?? "");

  return <RegistryLookupPage itemName={itemName} />;
}
