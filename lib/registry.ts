import { and, eq, or } from "drizzle-orm";
import { db } from "./db";
import { registryItems, registryFiles } from "./db/schema";

/**
 * Get registry items. If userId is provided, returns public items + owner's private items.
 * If userId is null, returns only public items.
 * Items include ownerId (userId) for per-user namespacing.
 */
export async function getRegistryItems(userId?: string | null) {
  const items = await db
    .select()
    .from(registryItems)
    .where(
      userId
        ? or(
            eq(registryItems.visibility, "public"),
            and(
              eq(registryItems.visibility, "private"),
              eq(registryItems.userId, userId)
            )
          )
        : eq(registryItems.visibility, "public")
    )
    .orderBy(registryItems.name);

  return items;
}

/**
 * Get registry item by owner + name. If item is private, requestUserId must match owner.
 * Returns null if item not found or access denied (private + no auth / wrong user).
 */
export async function getRegistryItemByOwnerAndName(
  ownerId: string,
  name: string,
  requestUserId?: string | null
) {
  const [item] = await db
    .select()
    .from(registryItems)
    .where(
      and(
        eq(registryItems.userId, ownerId),
        eq(registryItems.name, name)
      )
    );

  if (!item) return null;

  // Private item: only owner can access
  if (item.visibility === "private") {
    if (!requestUserId || item.userId !== requestUserId) return null;
  }

  const files = await db
    .select()
    .from(registryFiles)
    .where(eq(registryFiles.itemId, item.id));

  return { ...item, files };
}

/**
 * @deprecated Use getRegistryItemByOwnerAndName. For backward compat, looks up by name only.
 * If multiple items match (different owners), returns first public one or owner's if requestUserId matches.
 */
export async function getRegistryItemByName(
  name: string,
  requestUserId?: string | null
) {
  const items = await db
    .select()
    .from(registryItems)
    .where(eq(registryItems.name, name));

  if (items.length === 0) return null;
  if (items.length === 1) {
    const item = items[0];
    if (item.visibility === "private" && (!requestUserId || item.userId !== requestUserId))
      return null;
    const files = await db
      .select()
      .from(registryFiles)
      .where(eq(registryFiles.itemId, item.id));
    return { ...item, files };
  }

  // Multiple: prefer owner's, then first public
  const ownerMatch = requestUserId ? items.find((i) => i.userId === requestUserId) : undefined;
  const publicMatch = items.find((i) => i.visibility === "public");
  const pick = ownerMatch ?? publicMatch ?? items[0];
  if (!pick) return null;
  if (pick.visibility === "private" && (!requestUserId || pick.userId !== requestUserId))
    return null;
  const files = await db
    .select()
    .from(registryFiles)
    .where(eq(registryFiles.itemId, pick.id));
  return { ...pick, files };
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

/**
 * Get registry items owned by a specific user (for dashboard).
 */
export async function getRegistryItemsByUserId(userId: string) {
  const items = await db
    .select()
    .from(registryItems)
    .where(eq(registryItems.userId, userId))
    .orderBy(registryItems.name);

  return items;
}

export async function createRegistryItem(data: {
  name: string;
  type: string;
  title: string;
  description?: string | null;
  content: string;
  userId?: string | null;
  visibility?: "public" | "private";
}) {
  const [item] = await db
    .insert(registryItems)
    .values({
      name: data.name,
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      userId: data.userId ?? null,
      visibility: data.visibility ?? "public",
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
  userId?: string | null;
}) {
  const owner = item.userId ?? "legacy";
  return {
    name: item.name,
    owner,
    type: item.type,
    title: item.title,
    description: item.description ?? undefined,
    files: [{ path: `registry/modules/${item.name}.tsx`, type: item.type }],
  };
}
