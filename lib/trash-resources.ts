import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { registryItems, registryProjects } from "@/lib/db/schema";
import { getWritableOrganizationTargetForUser } from "@/lib/publish-target";

const ARCHIVED = "archived" as const;

export type TrashResourceListItem = {
  id: string;
  name: string;
  title: string;
  type: string;
  visibility: "public" | "private";
  archivedAt: Date | null;
  canonicalProjectId: string | null;
  canonicalProjectKey: string | null;
  projectTitle: string | null;
  projectSlug: string | null;
};

function normalizeVisibility(value: string): "public" | "private" {
  return value === "private" ? "private" : "public";
}

/**
 * Archived registry components the viewer may manage from trash (restore / permanent delete).
 */
export async function listTrashArchivedResources(params: {
  userId: string;
  activeOrganizationId: string | null;
}): Promise<TrashResourceListItem[]> {
  if (params.activeOrganizationId) {
    const writable = await getWritableOrganizationTargetForUser(
      params.userId,
      params.activeOrganizationId,
    );
    if (!writable) {
      return [];
    }

    const rows = await db
      .select({
        id: registryItems.id,
        name: registryItems.name,
        title: registryItems.title,
        type: registryItems.type,
        visibility: registryItems.visibility,
        archivedAt: registryItems.archivedAt,
        canonicalProjectId: registryItems.canonicalProjectId,
        canonicalProjectKey: registryItems.canonicalProjectKey,
        projectTitle: registryProjects.title,
        projectSlug: registryProjects.slug,
      })
      .from(registryItems)
      .leftJoin(registryProjects, eq(registryItems.canonicalProjectId, registryProjects.id))
      .where(
        and(
          eq(registryItems.status, ARCHIVED),
          eq(registryItems.organizationId, params.activeOrganizationId),
          isNotNull(registryItems.canonicalProjectId),
        ),
      )
      .orderBy(desc(registryItems.archivedAt), desc(registryItems.updatedAt));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      type: row.type,
      visibility: normalizeVisibility(row.visibility),
      archivedAt: row.archivedAt ?? null,
      canonicalProjectId: row.canonicalProjectId,
      canonicalProjectKey: row.canonicalProjectKey,
      projectTitle: row.projectTitle ?? null,
      projectSlug: row.projectSlug ?? null,
    }));
  }

  const rows = await db
    .select({
      id: registryItems.id,
      name: registryItems.name,
      title: registryItems.title,
      type: registryItems.type,
      visibility: registryItems.visibility,
      archivedAt: registryItems.archivedAt,
      canonicalProjectId: registryItems.canonicalProjectId,
      canonicalProjectKey: registryItems.canonicalProjectKey,
      projectTitle: registryProjects.title,
      projectSlug: registryProjects.slug,
    })
    .from(registryItems)
    .leftJoin(registryProjects, eq(registryItems.canonicalProjectId, registryProjects.id))
    .where(
      and(
        eq(registryItems.status, ARCHIVED),
        eq(registryItems.userId, params.userId),
        isNull(registryItems.organizationId),
        isNotNull(registryItems.canonicalProjectId),
      ),
    )
    .orderBy(desc(registryItems.archivedAt), desc(registryItems.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    title: row.title,
    type: row.type,
    visibility: normalizeVisibility(row.visibility),
    archivedAt: row.archivedAt ?? null,
    canonicalProjectId: row.canonicalProjectId,
    canonicalProjectKey: row.canonicalProjectKey,
    projectTitle: row.projectTitle ?? null,
    projectSlug: row.projectSlug ?? null,
  }));
}
