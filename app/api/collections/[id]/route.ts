import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { registryCollections } from "@/lib/db/schema";

function isKebab(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

async function requireUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);
  return tokenCtx?.userId ?? session?.user?.id ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request);
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
    .where(and(eq(registryCollections.id, id), eq(registryCollections.ownerUserId, userId)))
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
  const userId = await requireUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const [deleted] = await db
    .delete(registryCollections)
    .where(and(eq(registryCollections.id, id), eq(registryCollections.ownerUserId, userId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

