import { and, eq } from "drizzle-orm";
import { db } from "@cozy/db";
import { apiKey, registryApiKeyPolicies } from "@cozy/db/schema";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

export type RegistryApiKeyPolicyBody = {
  allowedCollectionIds?: string[];
  allowedTypes?: string[];
  allowedOwnerHandlesOrIds?: string[];
  allowPublicOutsideCollections?: boolean;
};

type RegistryApiKeyPolicyContext = Pick<
  PlatformRequestContext,
  "userId" | "activeTeamId"
>;

function normalizePolicyRow(
  row: typeof registryApiKeyPolicies.$inferSelect | null | undefined,
) {
  if (!row) {
    return null;
  }

  return {
    apiKeyId: row.apiKeyId,
    ownerUserId: row.ownerUserId,
    ownerTeamId: row.ownerTeamId,
    allowedCollectionIds: (row.allowedCollectionIds ?? []) as string[],
    allowedTypes: (row.allowedTypes ?? []) as string[],
    allowedOwnerHandlesOrIds: (row.allowedOwnerHandlesOrIds ?? []) as string[],
    allowPublicOutsideCollections: !!row.allowPublicOutsideCollections,
  };
}

async function verifyOwnedApiKey(input: {
  apiKeyId: string;
  userId: string | null;
}) {
  if (!input.userId) {
    return null;
  }

  const [keyRow] = await db
    .select({ id: apiKey.id, referenceId: apiKey.referenceId })
    .from(apiKey)
    .where(eq(apiKey.id, input.apiKeyId))
    .limit(1);

  if (!keyRow || keyRow.referenceId !== input.userId) {
    return null;
  }

  return keyRow;
}

function getScopedPolicyWhere(input: {
  apiKeyId: string;
  userId: string;
  activeTeamId: string | null;
}) {
  return and(
    eq(registryApiKeyPolicies.apiKeyId, input.apiKeyId),
    input.activeTeamId
      ? eq(registryApiKeyPolicies.ownerTeamId, input.activeTeamId)
      : eq(registryApiKeyPolicies.ownerUserId, input.userId),
  );
}

export async function getRegistryApiKeyPolicy(input: {
  context: RegistryApiKeyPolicyContext;
  apiKeyId: string;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const keyRow = await verifyOwnedApiKey({
    apiKeyId: input.apiKeyId,
    userId: input.context.userId,
  });
  if (!keyRow) {
    return { status: 404, body: { error: "Not found" } };
  }

  const [policy] = await db
    .select()
    .from(registryApiKeyPolicies)
    .where(
      getScopedPolicyWhere({
        apiKeyId: input.apiKeyId,
        userId: input.context.userId,
        activeTeamId: input.context.activeTeamId ?? null,
      }),
    )
    .limit(1);

  return { status: 200, body: { policy: normalizePolicyRow(policy) } };
}

export async function putRegistryApiKeyPolicy(input: {
  context: RegistryApiKeyPolicyContext;
  apiKeyId: string;
  body: RegistryApiKeyPolicyBody | null;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const keyRow = await verifyOwnedApiKey({
    apiKeyId: input.apiKeyId,
    userId: input.context.userId,
  });
  if (!keyRow) {
    return { status: 404, body: { error: "Not found" } };
  }

  if (!input.body) {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const allowedCollectionIds = Array.isArray(input.body.allowedCollectionIds)
    ? input.body.allowedCollectionIds.filter(
        (value) => typeof value === "string" && value.length > 0,
      )
    : [];
  const allowedTypes = Array.isArray(input.body.allowedTypes)
    ? input.body.allowedTypes.filter(
        (value) => typeof value === "string" && value.length > 0,
      )
    : [];
  const allowedOwnerHandlesOrIds = Array.isArray(input.body.allowedOwnerHandlesOrIds)
    ? input.body.allowedOwnerHandlesOrIds.filter(
        (value) => typeof value === "string" && value.length > 0,
      )
    : [];
  const allowPublicOutsideCollections = !!input.body.allowPublicOutsideCollections;

  const where = getScopedPolicyWhere({
    apiKeyId: input.apiKeyId,
    userId: input.context.userId,
    activeTeamId: input.context.activeTeamId ?? null,
  });

  const [existing] = await db
    .select({ apiKeyId: registryApiKeyPolicies.apiKeyId })
    .from(registryApiKeyPolicies)
    .where(where)
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
      .where(where)
      .returning();

    return { status: 200, body: { policy: normalizePolicyRow(updated) } };
  }

  const [created] = await db
    .insert(registryApiKeyPolicies)
    .values({
      apiKeyId: input.apiKeyId,
      ownerUserId: input.context.activeTeamId ? null : input.context.userId,
      ownerTeamId: input.context.activeTeamId ?? null,
      allowedCollectionIds,
      allowedTypes,
      allowedOwnerHandlesOrIds,
      allowPublicOutsideCollections,
    })
    .returning();

  return { status: 200, body: { policy: normalizePolicyRow(created) } };
}

export async function deleteRegistryApiKeyPolicy(input: {
  context: RegistryApiKeyPolicyContext;
  apiKeyId: string;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const keyRow = await verifyOwnedApiKey({
    apiKeyId: input.apiKeyId,
    userId: input.context.userId,
  });
  if (!keyRow) {
    return { status: 404, body: { error: "Not found" } };
  }

  await db
    .delete(registryApiKeyPolicies)
    .where(
      getScopedPolicyWhere({
        apiKeyId: input.apiKeyId,
        userId: input.context.userId,
        activeTeamId: input.context.activeTeamId ?? null,
      }),
    );

  return { status: 200, body: { policy: null } };
}
