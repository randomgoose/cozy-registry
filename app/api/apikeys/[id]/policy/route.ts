import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKey, registryApiKeyPolicies } from "@/lib/db/schema";
import { getProjectScopeContext } from "@/lib/project-scope";

type PolicyBody = {
  allowedProjectIds?: string[];
  allowedTypes?: string[];
  allowedOwnerHandlesOrIds?: string[];
  allowPublicOutsideProjects?: boolean;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, activeOrganizationId } = await getProjectScopeContext(request);
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
    .where(
      and(
        eq(registryApiKeyPolicies.apiKeyId, id),
        activeOrganizationId
          ? eq(registryApiKeyPolicies.ownerOrganizationId, activeOrganizationId)
          : eq(registryApiKeyPolicies.ownerUserId, userId),
      ),
    )
    .limit(1);

  return NextResponse.json({
    policy: policy
      ? {
          apiKeyId: policy.apiKeyId,
          ownerUserId: policy.ownerUserId,
          ownerOrganizationId: policy.ownerOrganizationId,
          allowedProjectIds: (policy.allowedProjectIds ?? []) as string[],
          allowedTypes: (policy.allowedTypes ?? []) as string[],
          allowedOwnerHandlesOrIds: (policy.allowedOwnerHandlesOrIds ?? []) as string[],
          allowPublicOutsideProjects: !!policy.allowPublicOutsideProjects,
        }
      : null,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, activeOrganizationId } = await getProjectScopeContext(request);
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

  const allowedProjectIds = Array.isArray(body.allowedProjectIds)
    ? body.allowedProjectIds.filter((x) => typeof x === "string" && x.length > 0)
    : [];
  const allowedTypes = Array.isArray(body.allowedTypes)
    ? body.allowedTypes.filter((x) => typeof x === "string" && x.length > 0)
    : [];
  const allowedOwnerHandlesOrIds = Array.isArray(body.allowedOwnerHandlesOrIds)
    ? body.allowedOwnerHandlesOrIds.filter((x) => typeof x === "string" && x.length > 0)
    : [];
  const allowPublicOutsideProjects = !!body.allowPublicOutsideProjects;

  const [existing] = await db
    .select({ apiKeyId: registryApiKeyPolicies.apiKeyId })
    .from(registryApiKeyPolicies)
    .where(
      and(
        eq(registryApiKeyPolicies.apiKeyId, id),
        activeOrganizationId
          ? eq(registryApiKeyPolicies.ownerOrganizationId, activeOrganizationId)
          : eq(registryApiKeyPolicies.ownerUserId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(registryApiKeyPolicies)
      .set({
        allowedProjectIds,
        allowedTypes,
        allowedOwnerHandlesOrIds,
        allowPublicOutsideProjects,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(registryApiKeyPolicies.apiKeyId, id),
          activeOrganizationId
            ? eq(registryApiKeyPolicies.ownerOrganizationId, activeOrganizationId)
            : eq(registryApiKeyPolicies.ownerUserId, userId),
        ),
      )
      .returning();

    return NextResponse.json({ policy: updated ?? null });
  }

  const [created] = await db
    .insert(registryApiKeyPolicies)
    .values({
      apiKeyId: id,
      ownerUserId: activeOrganizationId ? null : userId,
      ownerOrganizationId: activeOrganizationId,
      allowedProjectIds,
      allowedTypes,
      allowedOwnerHandlesOrIds,
      allowPublicOutsideProjects,
    })
    .returning();

  return NextResponse.json({ policy: created });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, activeOrganizationId } = await getProjectScopeContext(request);
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

  await db
    .delete(registryApiKeyPolicies)
    .where(
      and(
        eq(registryApiKeyPolicies.apiKeyId, id),
        activeOrganizationId
          ? eq(registryApiKeyPolicies.ownerOrganizationId, activeOrganizationId)
          : eq(registryApiKeyPolicies.ownerUserId, userId),
      ),
    );

  return NextResponse.json({ policy: null });
}
