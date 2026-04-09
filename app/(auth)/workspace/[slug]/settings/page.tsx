import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ section?: string }> | { section?: string };
}) {
  const { slug: rawSlug } = await params;
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const slug = decodeURIComponent(rawSlug);
  const section =
    resolvedSearchParams.section === "members"
      ? "members"
      : resolvedSearchParams.section === "tokens"
        ? "tokens"
        : "organization";
  redirect(`/workspace/${encodeURIComponent(slug)}/settings/${section}`);
}
