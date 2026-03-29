import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { registryProjects } from "@/lib/db/schema";

export function slugifyProjectTitle(value: string): string {
  const s = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "project";
}

/** Slug is unique per organization or per personal owner (not globally). */
export async function generateUniqueRegistryProjectSlug(params: {
  title: string;
  organizationId: string | null;
  ownerUserId: string | null;
}): Promise<string> {
  const base = slugifyProjectTitle(params.title);
  let candidate = base;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = await db
      .select({ id: registryProjects.id })
      .from(registryProjects)
      .where(
        params.organizationId
          ? and(
              eq(registryProjects.organizationId, params.organizationId),
              eq(registryProjects.slug, candidate),
            )
          : and(
              eq(registryProjects.ownerUserId, params.ownerUserId!),
              eq(registryProjects.slug, candidate),
            ),
      )
      .limit(1);
    if (!row) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }
  throw new Error("Could not allocate a unique project slug");
}
