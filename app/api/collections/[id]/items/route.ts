import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCollectionScopeContext } from "@/lib/collection-scope";
import { registryCollectionItems, registryCollections, registryItems } from "@/lib/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, activeTeamId } = await getCollectionScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const [collection] = await db
    .select()
    .from(registryCollections)
    .where(
      and(
        eq(registryCollections.id, id),
        activeTeamId
          ? eq(registryCollections.ownerTeamId, activeTeamId)
          : eq(registryCollections.ownerUserId, userId),
      ),
    )
    .limit(1);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    .where(eq(registryCollectionItems.collectionId, id))
    .orderBy(registryItems.name);

  return NextResponse.json({ items: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, activeTeamId } = await getCollectionScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { itemId?: string } | null;
  if (!body?.itemId) {
    return NextResponse.json({ error: "Missing required field: itemId" }, { status: 400 });
  }

  const [collection] = await db
    .select()
    .from(registryCollections)
    .where(
      and(
        eq(registryCollections.id, id),
        activeTeamId
          ? eq(registryCollections.ownerTeamId, activeTeamId)
          : eq(registryCollections.ownerUserId, userId),
      ),
    )
    .limit(1);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [item] = await db
    .select({ id: registryItems.id })
    .from(registryItems)
    .where(
      and(
        eq(registryItems.id, body.itemId),
        activeTeamId
          ? eq(registryItems.teamId, activeTeamId)
          : eq(registryItems.userId, userId),
      ),
    )
    .limit(1);
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  try {
    await db.insert(registryCollectionItems).values({
      collectionId: id,
      itemId: body.itemId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add item";
    const isUnique = /\bduplicate key\b|\bunique constraint\b|23505/.test(msg);
    if (isUnique) {
      return NextResponse.json({ error: "Item already exists in this collection" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
