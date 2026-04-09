import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectId: string }>;
  searchParams?: Promise<{ section?: string }> | { section?: string };
}) {
  const { slug: rawSlug, projectId } = await params;
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const slug = decodeURIComponent(rawSlug);
  const section =
    resolvedSearchParams.section === "themes"
      ? "themes"
      : resolvedSearchParams.section === "danger"
        ? "danger"
        : "general";
  redirect(
    `/workspace/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/settings/${section}`,
  );
}
