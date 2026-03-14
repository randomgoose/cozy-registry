import { eq } from "drizzle-orm";
import { db } from "./db";
import { registryItems, registryFiles } from "./db/schema";

export async function getRegistryItems() {
  const items = await db
    .select()
    .from(registryItems)
    .orderBy(registryItems.name);

  return items;
}

export async function getRegistryItemByName(name: string) {
  const [item] = await db
    .select()
    .from(registryItems)
    .where(eq(registryItems.name, name));

  if (!item) return null;

  const files = await db
    .select()
    .from(registryFiles)
    .where(eq(registryFiles.itemId, item.id));

  return { ...item, files };
}

export function toShadcnRegistryItem(
  item: Awaited<ReturnType<typeof getRegistryItemByName>>
) {
  if (!item) return null;

  const base = {
    name: item.name,
    type: item.type as "registry:block" | "registry:component",
    title: item.title,
    description: item.description ?? undefined,
    dependencies: (item.dependencies as string[]) ?? [],
    registryDependencies: (item.registryDependencies as string[]) ?? [],
  };

  const files = item.files.map((f) => ({
    path: f.path,
    content: f.content,
    type: f.type as "registry:block" | "registry:component",
  }));

  return { ...base, files };
}

export async function createRegistryItem(data: {
  name: string;
  type: string;
  title: string;
  description?: string | null;
  content: string;
  userId?: string | null;
}) {
  const [item] = await db
    .insert(registryItems)
    .values({
      name: data.name,
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      userId: data.userId ?? null,
    })
    .returning();

  if (!item) throw new Error("Failed to create registry item");

  await db.insert(registryFiles).values({
    itemId: item.id,
    path: `registry/modules/${data.name}.tsx`,
    content: data.content,
    type: data.type,
  });

  return item;
}

export function toShadcnRegistryItemSummary(item: {
  name: string;
  type: string;
  title: string;
  description: string | null;
}) {
  return {
    name: item.name,
    type: item.type,
    title: item.title,
    description: item.description ?? undefined,
    files: [{ path: `registry/modules/${item.name}.tsx`, type: item.type }],
  };
}
