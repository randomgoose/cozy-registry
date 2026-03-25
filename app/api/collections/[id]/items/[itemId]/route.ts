import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCollectionScopeContext } from "@/lib/collection-scope";
import { registryCollectionItems, registryCollections } from "@/lib/db/schema";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { userId, activeTeamId } = await getCollectionScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id, itemId } = await params;

  const [collection] = await db
    .select({ id: registryCollections.id })
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

  await db
    .delete(registryCollectionItems)
    .where(and(eq(registryCollectionItems.collectionId, id), eq(registryCollectionItems.itemId, itemId)));

  return NextResponse.json({ success: true });
}
