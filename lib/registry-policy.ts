import { db } from "@/lib/db";
import { registryApiKeyPolicies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type RegistryPolicy = {
  apiKeyId: string;
  ownerUserId: string | null;
  allowedCollectionIds: string[];
  allowedTypes: string[];
  allowedOwnerHandlesOrIds: string[];
  allowPublicOutsideCollections: boolean;
};

export async function getRegistryPolicyForApiKey(
  apiKeyId: string,
): Promise<RegistryPolicy | null> {
  const [row] = await db
    .select()
    .from(registryApiKeyPolicies)
    .where(eq(registryApiKeyPolicies.apiKeyId, apiKeyId))
    .limit(1);

  if (!row) return null;
  return {
    apiKeyId: row.apiKeyId,
    ownerUserId: row.ownerUserId ?? null,
    allowedCollectionIds: (row.allowedCollectionIds ?? []) as string[],
    allowedTypes: (row.allowedTypes ?? []) as string[],
    allowedOwnerHandlesOrIds: (row.allowedOwnerHandlesOrIds ?? []) as string[],
    allowPublicOutsideCollections: !!row.allowPublicOutsideCollections,
  };
}
