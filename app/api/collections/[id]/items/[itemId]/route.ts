import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { registryCollectionItems, registryCollections } from "@/lib/db/schema";

async function requireUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);
  return tokenCtx?.userId ?? session?.user?.id ?? null;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const userId = await requireUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id, itemId } = await params;

  const [collection] = await db
    .select({ id: registryCollections.id })
    .from(registryCollections)
    .where(and(eq(registryCollections.id, id), eq(registryCollections.ownerUserId, userId)))
    .limit(1);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(registryCollectionItems)
    .where(and(eq(registryCollectionItems.collectionId, id), eq(registryCollectionItems.itemId, itemId)));

  return NextResponse.json({ success: true });
}

