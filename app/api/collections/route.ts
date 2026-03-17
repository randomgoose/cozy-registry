import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { resolveOwner } from "@/lib/owner";
import { registryCollections, registryCollectionItems } from "@/lib/db/schema";

function isKebab(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);
  const userId = tokenCtx?.userId ?? session?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Sign in or provide Authorization: Bearer <token>" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null) as
    | {
        slug?: string;
        title?: string;
        description?: string | null;
        visibility?: "public" | "private";
      }
    | null;
  if (!body?.slug || !body?.title) {
    return NextResponse.json(
      { error: "Missing required fields: slug, title" },
      { status: 400 },
    );
  }
  if (!isKebab(body.slug)) {
    return NextResponse.json(
      { error: "slug must be kebab-case (e.g. marketing-blocks)" },
      { status: 400 },
    );
  }

  const visibility = body.visibility === "public" ? "public" : "private";

  const [created] = await db
    .insert(registryCollections)
    .values({
      ownerUserId: userId,
      slug: body.slug,
      title: body.title,
      description: body.description ?? null,
      visibility,
    })
    .returning();

  return NextResponse.json({ collection: created });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ownerParam = url.searchParams.get("owner");

  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);
  const requestUserId = tokenCtx?.userId ?? session?.user?.id ?? null;

  if (!ownerParam) {
    if (!requestUserId) {
      return NextResponse.json(
        { error: "Authentication required (owner not specified)" },
        { status: 401 },
      );
    }

    // Default: list current user's collections.
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
      .where(eq(registryCollections.ownerUserId, requestUserId))
      .orderBy(registryCollections.slug);

    const counts =
      rows.length === 0
        ? new Map<string, number>()
        : await db
            .select({
              collectionId: registryCollectionItems.collectionId,
              itemId: registryCollectionItems.itemId,
            })
            .from(registryCollectionItems)
            .where(
              inArray(
                registryCollectionItems.collectionId,
                rows.map((r) => r.id),
              ),
            )
            .then((links) => {
              const map = new Map<string, number>();
              for (const l of links) {
                map.set(l.collectionId, (map.get(l.collectionId) ?? 0) + 1);
              }
              return map;
            });

    return NextResponse.json({
      collections: rows.map((r) => ({
        ...r,
        itemCount: counts.get(r.id) ?? 0,
      })),
    });
  }

  const resolved = await resolveOwner(ownerParam);
  if (!resolved) {
    return NextResponse.json({ collections: [] });
  }

  const canSeePrivate = requestUserId != null && resolved.userId === requestUserId;
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

  // Include item counts for public views (cheap + useful in UI)
  const counts = await db
    .select({
      collectionId: registryCollectionItems.collectionId,
      itemId: registryCollectionItems.itemId,
    })
    .from(registryCollectionItems)
    .where(
      inArray(
        registryCollectionItems.collectionId,
        rows.map((r) => r.id),
      ),
    )
    .then((links) => {
      const map = new Map<string, number>();
      for (const l of links) {
        map.set(l.collectionId, (map.get(l.collectionId) ?? 0) + 1);
      }
      return map;
    });

  return NextResponse.json({
    collections: rows.map((r) => ({
      ...r,
      itemCount: counts.get(r.id) ?? 0,
    })),
  });
}

