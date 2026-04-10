import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { registryItems } from "@/lib/db/schema";

export type ProjectItemRow = {
  itemId: string;
  name: string;
  title: string;
  type: string;
  visibility: string;
  description: string | null;
  meta: Record<string, unknown> | null;
  addedAt: string;
};

export async function listProjectItems(projectId: string): Promise<ProjectItemRow[]> {
  const rows = await db
    .select({
      itemId: registryItems.id,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      meta: registryItems.meta,
      addedAt: registryItems.updatedAt,
    })
    .from(registryItems)
    .where(
      and(
        eq(registryItems.canonicalProjectId, projectId),
        eq(registryItems.status, "active"),
      ),
    )
    .orderBy(registryItems.name);

  return rows.map((row) => ({
    ...row,
    meta:
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : null,
    addedAt: row.addedAt instanceof Date ? row.addedAt.toISOString() : String(row.addedAt),
  }));
}
