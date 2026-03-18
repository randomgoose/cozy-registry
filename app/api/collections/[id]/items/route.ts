import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { registryCollectionItems, registryCollections, registryItems } from "@/lib/db/schema";

async function requireUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);
  return tokenCtx?.userId ?? session?.user?.id ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const [collection] = await db
    .select()
    .from(registryCollections)
    .where(and(eq(registryCollections.id, id), eq(registryCollections.ownerUserId, userId)))
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
  const userId = await requireUserId(request);
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
    .where(and(eq(registryCollections.id, id), eq(registryCollections.ownerUserId, userId)))
    .limit(1);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [item] = await db
    .select({ id: registryItems.id })
    .from(registryItems)
    .where(eq(registryItems.id, body.itemId))
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

