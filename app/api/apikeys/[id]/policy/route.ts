import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKey, registryApiKeyPolicies } from "@/lib/db/schema";

type PolicyBody = {
  allowedCollectionIds?: string[];
  allowedTypes?: string[];
  allowedOwnerHandlesOrIds?: string[];
  allowPublicOutsideCollections?: boolean;
};

async function requireUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const [keyRow] = await db
    .select({ id: apiKey.id, referenceId: apiKey.referenceId })
    .from(apiKey)
    .where(eq(apiKey.id, id))
    .limit(1);
  if (!keyRow || keyRow.referenceId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [policy] = await db
    .select()
    .from(registryApiKeyPolicies)
    .where(eq(registryApiKeyPolicies.apiKeyId, id))
    .limit(1);

  return NextResponse.json({
    policy: policy
      ? {
          apiKeyId: policy.apiKeyId,
          ownerUserId: policy.ownerUserId,
          allowedCollectionIds: (policy.allowedCollectionIds ?? []) as string[],
          allowedTypes: (policy.allowedTypes ?? []) as string[],
          allowedOwnerHandlesOrIds: (policy.allowedOwnerHandlesOrIds ?? []) as string[],
          allowPublicOutsideCollections: !!policy.allowPublicOutsideCollections,
        }
      : null,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const [keyRow] = await db
    .select({ id: apiKey.id, referenceId: apiKey.referenceId })
    .from(apiKey)
    .where(eq(apiKey.id, id))
    .limit(1);
  if (!keyRow || keyRow.referenceId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as PolicyBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowedCollectionIds = Array.isArray(body.allowedCollectionIds)
    ? body.allowedCollectionIds.filter((x) => typeof x === "string" && x.length > 0)
    : [];
  const allowedTypes = Array.isArray(body.allowedTypes)
    ? body.allowedTypes.filter((x) => typeof x === "string" && x.length > 0)
    : [];
  const allowedOwnerHandlesOrIds = Array.isArray(body.allowedOwnerHandlesOrIds)
    ? body.allowedOwnerHandlesOrIds.filter((x) => typeof x === "string" && x.length > 0)
    : [];
  const allowPublicOutsideCollections = !!body.allowPublicOutsideCollections;

  const [existing] = await db
    .select({ apiKeyId: registryApiKeyPolicies.apiKeyId })
    .from(registryApiKeyPolicies)
    .where(eq(registryApiKeyPolicies.apiKeyId, id))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(registryApiKeyPolicies)
      .set({
        allowedCollectionIds,
        allowedTypes,
        allowedOwnerHandlesOrIds,
        allowPublicOutsideCollections,
        updatedAt: new Date(),
      })
      .where(and(eq(registryApiKeyPolicies.apiKeyId, id), eq(registryApiKeyPolicies.ownerUserId, userId)))
      .returning();

    return NextResponse.json({ policy: updated ?? null });
  }

  const [created] = await db
    .insert(registryApiKeyPolicies)
    .values({
      apiKeyId: id,
      ownerUserId: userId,
      allowedCollectionIds,
      allowedTypes,
      allowedOwnerHandlesOrIds,
      allowPublicOutsideCollections,
    })
    .returning();

  return NextResponse.json({ policy: created });
}

