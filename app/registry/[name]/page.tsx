import { notFound } from "next/navigation";
import { getRegistryItemByName, toShadcnRegistryItem } from "@/lib/registry";
import { ComponentDetail } from "./ComponentDetail";

export const dynamic = "force-dynamic";

export default async function RegistryItemPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  let item: Awaited<ReturnType<typeof getRegistryItemByName>>;
  try {
    item = await getRegistryItemByName(name);
  } catch {
    notFound();
  }

  if (!item) notFound();

  const shadcnItem = toShadcnRegistryItem(item);
  const code = shadcnItem?.files?.[0]?.content ?? "";

  return (
    <ComponentDetail
      name={item.name}
      title={item.title}
      description={item.description}
      type={item.type}
      code={code}
    />
  );
}
