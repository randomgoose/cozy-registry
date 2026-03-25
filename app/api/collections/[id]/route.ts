import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCollectionScopeContext } from "@/lib/collection-scope";
import { registryCollections } from "@/lib/db/schema";

function isKebab(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, activeTeamId } = await getCollectionScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as
    | {
        slug?: string;
        title?: string;
        description?: string | null;
        visibility?: "public" | "private";
      }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.slug != null && !isKebab(body.slug)) {
    return NextResponse.json(
      { error: "slug must be kebab-case" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(registryCollections)
    .set({
      ...(body.slug != null ? { slug: body.slug } : {}),
      ...(body.title != null ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.visibility != null
        ? { visibility: body.visibility === "public" ? "public" : "private" }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(registryCollections.id, id),
        activeTeamId
          ? eq(registryCollections.ownerTeamId, activeTeamId)
          : eq(registryCollections.ownerUserId, userId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ collection: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, activeTeamId } = await getCollectionScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const [deleted] = await db
    .delete(registryCollections)
    .where(
      and(
        eq(registryCollections.id, id),
        activeTeamId
          ? eq(registryCollections.ownerTeamId, activeTeamId)
          : eq(registryCollections.ownerUserId, userId),
      ),
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
