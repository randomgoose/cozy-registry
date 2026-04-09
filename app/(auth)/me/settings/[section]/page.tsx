import { notFound } from "next/navigation";
import { SettingsPageClient } from "../../../settings/settings-page-client";

export const dynamic = "force-dynamic";

export default async function PersonalSettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (section !== "tokens") {
    notFound();
  }

  return <SettingsPageClient section={section} />;
}
