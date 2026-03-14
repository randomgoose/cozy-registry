import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRegistryItemByOwnerAndName, toShadcnRegistryItem } from "@/lib/registry";
import { ComponentDetail } from "./ComponentDetail";

export const dynamic = "force-dynamic";

export default async function RegistryItemPage({
  params,
}: {
  params: Promise<{ owner: string; name: string }>;
}) {
  const { owner, name } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const requestUserId = session?.user?.id ?? null;

  let item: Awaited<ReturnType<typeof getRegistryItemByOwnerAndName>>;
  try {
    item = await getRegistryItemByOwnerAndName(owner, name, requestUserId);
  } catch {
    notFound();
  }

  if (!item) notFound();

  const shadcnItem = toShadcnRegistryItem(item);
  const code = shadcnItem?.files?.[0]?.content ?? "";

  return (
    <ComponentDetail
      owner={owner}
      name={item.name}
      title={item.title}
      description={item.description}
      type={item.type}
      code={code}
    />
  );
}
