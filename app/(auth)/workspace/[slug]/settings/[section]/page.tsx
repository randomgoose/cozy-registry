import { notFound } from "next/navigation";
import { SettingsPageClient } from "../../../../settings/settings-page-client";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsSectionPage({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}) {
  const { section } = await params;

  if (section !== "organization" && section !== "members" && section !== "tokens") {
    notFound();
  }

  return <SettingsPageClient section={section} />;
}
