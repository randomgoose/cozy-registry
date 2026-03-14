import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRegistryItemByName } from "@/lib/registry";

export const dynamic = "force-dynamic";

/**
 * Backward compat: /registry/[name] redirects to /registry/[owner]/[name]
 */
export default async function RegistryItemPageLegacy({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;

  const item = await getRegistryItemByName(name, userId);
  if (!item) notFound();

  const owner = item.userId ?? "legacy";
  redirect(`/registry/${owner}/${name}`);
}
