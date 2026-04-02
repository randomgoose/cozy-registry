import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { registryItems, registryProjectItems } from "@/lib/db/schema";
import {
  getProjectIfAccessible,
  getUserProjectRole,
  roleCanEditProject,
} from "@/lib/project-permissions";

export async function linkRegistryItemToProject(params: {
  userId: string;
  projectId: string;
  itemId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, projectId, itemId } = params;
  const project = await getProjectIfAccessible(userId, projectId);
  if (!project) {
    return { ok: false, error: "Project not found or no access" };
  }
  const role = await getUserProjectRole(userId, projectId, project.ownerUserId);
  if (!roleCanEditProject(role)) {
    return { ok: false, error: "You do not have permission to add items to this project" };
  }

  const [item] = await db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      organizationId: registryItems.organizationId,
      status: registryItems.status,
    })
    .from(registryItems)
    .where(eq(registryItems.id, itemId))
    .limit(1);
  if (!item) {
    return { ok: false, error: "Registry item not found" };
  }
  if (item.status !== "active") {
    return { ok: false, error: "Only active registry items can be linked to projects" };
  }

  if (project.organizationId) {
    if (item.organizationId !== project.organizationId) {
      return {
        ok: false,
        error: "Item must belong to the same organization as this project",
      };
    }
  } else if (item.userId !== userId) {
    return { ok: false, error: "Item must belong to you for a personal project" };
  }

  try {
    await db.insert(registryProjectItems).values({ projectId, itemId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isUnique = /\bduplicate key\b|\bunique constraint\b|23505/.test(msg);
    if (isUnique) {
      return { ok: true };
    }
    return { ok: false, error: msg };
  }
  return { ok: true };
}
