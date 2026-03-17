import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";

export type OwnerResolveResult = {
  userId: string;
  handle: string | null;
};

/**
 * Resolve a public-facing owner identifier into userId.
 * - Prefer handle match (new URLs)
 * - Fallback to id match (backward compat)
 */
export async function resolveOwner(owner: string): Promise<OwnerResolveResult | null> {
  const key = owner.trim();
  if (!key) return null;

  const [row] = await db
    .select({ id: user.id, handle: user.handle })
    .from(user)
    .where(or(eq(user.handle, key), eq(user.id, key)))
    .limit(1);

  if (!row) return null;
  return { userId: row.id, handle: row.handle ?? null };
}

