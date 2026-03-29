import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@cozy/db";
import {
  registryCollectionItems,
  registryCollections,
  registryItems,
} from "@cozy/db/schema";
import { resolveOwner } from "@cozy/registry-domain/owner";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

function isKebab(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

type CollectionsContext = Pick<PlatformRequestContext, "userId" | "activeTeamId">;

async function listCollectionItemCounts(collectionIds: string[]) {
  if (collectionIds.length === 0) {
    return new Map<string, number>();
  }

  const links = await db
    .select({
      collectionId: registryCollectionItems.collectionId,
      itemId: registryCollectionItems.itemId,
    })
    .from(registryCollectionItems)
    .where(inArray(registryCollectionItems.collectionId, collectionIds));

  const counts = new Map<string, number>();
  for (const link of links) {
    counts.set(link.collectionId, (counts.get(link.collectionId) ?? 0) + 1);
  }
  return counts;
}

async function getOwnedCollection(input: {
  context: CollectionsContext;
  id: string;
}) {
  const { userId, activeTeamId } = input.context;
  if (!userId) {
    return null;
  }

  const [collection] = await db
    .select()
    .from(registryCollections)
    .where(
      and(
        eq(registryCollections.id, input.id),
        activeTeamId
          ? eq(registryCollections.ownerTeamId, activeTeamId)
          : eq(registryCollections.ownerUserId, userId),
      ),
    )
    .limit(1);

  return collection ?? null;
}

export async function listCollections(input: {
  context: CollectionsContext;
  owner?: string | null;
}) {
  const ownerParam = input.owner?.trim() ?? null;

  if (!ownerParam) {
    if (!input.context.userId) {
      return {
        status: 401,
        body: { error: "Authentication required (owner not specified)" },
      };
    }

    const rows = await db
      .select({
        id: registryCollections.id,
        ownerUserId: registryCollections.ownerUserId,
        ownerTeamId: registryCollections.ownerTeamId,
        slug: registryCollections.slug,
        title: registryCollections.title,
        description: registryCollections.description,
        visibility: registryCollections.visibility,
        createdAt: registryCollections.createdAt,
        updatedAt: registryCollections.updatedAt,
      })
      .from(registryCollections)
      .where(
        input.context.activeTeamId
          ? eq(registryCollections.ownerTeamId, input.context.activeTeamId)
          : eq(registryCollections.ownerUserId, input.context.userId),
      )
      .orderBy(registryCollections.slug);

    const counts = await listCollectionItemCounts(rows.map((row) => row.id));
    return {
      status: 200,
      body: {
        collections: rows.map((row) => ({
          ...row,
          itemCount: counts.get(row.id) ?? 0,
        })),
      },
    };
  }

  const resolved = await resolveOwner(ownerParam);
  if (!resolved) {
    return { status: 200, body: { collections: [] } };
  }

  const canSeePrivate =
    input.context.userId != null && resolved.userId === input.context.userId;

  const rows = await db
    .select({
      id: registryCollections.id,
      ownerUserId: registryCollections.ownerUserId,
      slug: registryCollections.slug,
      title: registryCollections.title,
      description: registryCollections.description,
      visibility: registryCollections.visibility,
      createdAt: registryCollections.createdAt,
      updatedAt: registryCollections.updatedAt,
    })
    .from(registryCollections)
    .where(
      and(
        eq(registryCollections.ownerUserId, resolved.userId),
        canSeePrivate
          ? or(
              eq(registryCollections.visibility, "public"),
              eq(registryCollections.visibility, "private"),
            )
          : eq(registryCollections.visibility, "public"),
      ),
    )
    .orderBy(registryCollections.slug);

  const counts = await listCollectionItemCounts(rows.map((row) => row.id));
  return {
    status: 200,
    body: {
      collections: rows.map((row) => ({
        ...row,
        itemCount: counts.get(row.id) ?? 0,
      })),
    },
  };
}

export async function createCollectionFromBody(input: {
  context: CollectionsContext;
  body: {
    slug?: string;
    title?: string;
    description?: string | null;
    visibility?: "public" | "private";
  } | null;
}) {
  if (!input.context.userId) {
    return {
      status: 401,
      body: {
        error:
          "Authentication required. Sign in or provide Authorization: Bearer <token>",
      },
    };
  }

  if (!input.body?.slug || !input.body?.title) {
    return {
      status: 400,
      body: { error: "Missing required fields: slug, title" },
    };
  }

  if (!isKebab(input.body.slug)) {
    return {
      status: 400,
      body: { error: "slug must be kebab-case (e.g. marketing-blocks)" },
    };
  }

  const visibility = input.body.visibility === "public" ? "public" : "private";

  try {
    const [created] = await db
      .insert(registryCollections)
      .values({
        ownerUserId: input.context.activeTeamId ? null : input.context.userId,
        ownerTeamId: input.context.activeTeamId,
        slug: input.body.slug,
        title: input.body.title,
        description: input.body.description ?? null,
        visibility,
      })
      .returning();

    return { status: 200, body: { collection: created } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create collection";
    const isUnique = /\bduplicate key\b|\bunique constraint\b|23505/.test(message);
    if (isUnique) {
      return {
        status: 409,
        body: { error: "Collection slug already exists" },
      };
    }

    const isMissingTable = /\brelation\b.*\bdoes not exist\b/i.test(message);
    if (isMissingTable) {
      return {
        status: 500,
        body: {
          error:
            "Database schema is missing. Run migrations (e.g. pnpm db:push) against this environment's database.",
        },
      };
    }

    return { status: 500, body: { error: message } };
  }
}

export async function listCollectionItems(input: {
  context: CollectionsContext;
  id: string;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const collection = await getOwnedCollection(input);
  if (!collection) {
    return { status: 404, body: { error: "Not found" } };
  }

  const rows = await db
    .select({
      itemId: registryItems.id,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      addedAt: registryCollectionItems.addedAt,
    })
    .from(registryCollectionItems)
    .innerJoin(registryItems, eq(registryCollectionItems.itemId, registryItems.id))
    .where(eq(registryCollectionItems.collectionId, input.id))
    .orderBy(registryItems.name);

  return { status: 200, body: { items: rows } };
}

export async function addItemToCollection(input: {
  context: CollectionsContext;
  id: string;
  body: { itemId?: string } | null;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  if (!input.body?.itemId) {
    return {
      status: 400,
      body: { error: "Missing required field: itemId" },
    };
  }

  const collection = await getOwnedCollection(input);
  if (!collection) {
    return { status: 404, body: { error: "Not found" } };
  }

  const [item] = await db
    .select({ id: registryItems.id })
    .from(registryItems)
    .where(
      and(
        eq(registryItems.id, input.body.itemId),
        input.context.activeTeamId
          ? eq(registryItems.teamId, input.context.activeTeamId)
          : eq(registryItems.userId, input.context.userId),
      ),
    )
    .limit(1);

  if (!item) {
    return { status: 404, body: { error: "Item not found" } };
  }

  try {
    await db.insert(registryCollectionItems).values({
      collectionId: input.id,
      itemId: input.body.itemId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add item";
    const isUnique = /\bduplicate key\b|\bunique constraint\b|23505/.test(message);
    if (isUnique) {
      return {
        status: 409,
        body: { error: "Item already exists in this collection" },
      };
    }
    return { status: 500, body: { error: message } };
  }

  return { status: 200, body: { success: true } };
}

export async function removeItemFromCollection(input: {
  context: CollectionsContext;
  id: string;
  itemId: string;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const collection = await getOwnedCollection(input);
  if (!collection) {
    return { status: 404, body: { error: "Not found" } };
  }

  await db
    .delete(registryCollectionItems)
    .where(
      and(
        eq(registryCollectionItems.collectionId, input.id),
        eq(registryCollectionItems.itemId, input.itemId),
      ),
    );

  return { status: 200, body: { success: true } };
}

export async function updateCollectionFromBody(input: {
  context: CollectionsContext;
  id: string;
  body:
    | {
        slug?: string;
        title?: string;
        description?: string | null;
        visibility?: "public" | "private";
      }
    | null;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  if (!input.body) {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  if (input.body.slug != null && !isKebab(input.body.slug)) {
    return { status: 400, body: { error: "slug must be kebab-case" } };
  }

  const [updated] = await db
    .update(registryCollections)
    .set({
      ...(input.body.slug != null ? { slug: input.body.slug } : {}),
      ...(input.body.title != null ? { title: input.body.title } : {}),
      ...(input.body.description !== undefined
        ? { description: input.body.description }
        : {}),
      ...(input.body.visibility != null
        ? {
            visibility:
              input.body.visibility === "public" ? "public" : "private",
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(registryCollections.id, input.id),
        input.context.activeTeamId
          ? eq(registryCollections.ownerTeamId, input.context.activeTeamId)
          : eq(registryCollections.ownerUserId, input.context.userId),
      ),
    )
    .returning();

  if (!updated) {
    return { status: 404, body: { error: "Not found" } };
  }

  return { status: 200, body: { collection: updated } };
}

export async function deleteCollection(input: {
  context: CollectionsContext;
  id: string;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const [deleted] = await db
    .delete(registryCollections)
    .where(
      and(
        eq(registryCollections.id, input.id),
        input.context.activeTeamId
          ? eq(registryCollections.ownerTeamId, input.context.activeTeamId)
          : eq(registryCollections.ownerUserId, input.context.userId),
      ),
    )
    .returning();

  if (!deleted) {
    return { status: 404, body: { error: "Not found" } };
  }

  return { status: 200, body: { success: true } };
}
