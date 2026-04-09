import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PersonalProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ section?: string }> | { section?: string };
}) {
  const { projectId } = await params;
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const section =
    resolvedSearchParams.section === "themes"
      ? "themes"
      : resolvedSearchParams.section === "danger"
        ? "danger"
        : "general";
  redirect(`/me/projects/${encodeURIComponent(projectId)}/settings/${section}`);
}
