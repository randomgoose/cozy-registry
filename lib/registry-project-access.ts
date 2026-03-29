import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { registryProjects } from "@/lib/db/schema";
import { getProjectIfAccessible, type RegistryProjectRow } from "@/lib/project-permissions";

/**
 * Resolves a project by slug that the user may access (owner or member).
 * If multiple rows share the same slug across scopes, returns the first accessible match.
 */
export async function findAccessibleRegistryProjectBySlug(
  userId: string,
  slug: string,
): Promise<RegistryProjectRow | null> {
  const key = slug.trim();
  if (!key) return null;
  const candidates = await db
    .select()
    .from(registryProjects)
    .where(eq(registryProjects.slug, key));
  for (const row of candidates) {
    const accessible = await getProjectIfAccessible(userId, row.id);
    if (accessible) return accessible;
  }
  return null;
}
