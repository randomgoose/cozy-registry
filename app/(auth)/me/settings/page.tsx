import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PersonalSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ section?: string }> | { section?: string };
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const section =
    resolvedSearchParams.section === "tokens" ? "tokens" : "tokens";
  redirect(`/me/settings/${section}`);
}
