import { and, eq, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

import { db } from "@/lib/db";
import { registryProjectMembers, registryProjects } from "@/lib/db/schema";

export type ProjectRole = "owner" | "admin" | "editor" | "viewer";

export type RegistryProjectRow = InferSelectModel<typeof registryProjects>;

export function activeProjectClause() {
  return and(
    eq(registryProjects.status, "active"),
    isNull(registryProjects.archivedAt),
    isNull(registryProjects.deletedAt),
  );
}

export function archivedProjectClause() {
  return and(
    eq(registryProjects.status, "archived"),
    isNull(registryProjects.deletedAt),
  );
}

export async function getUserProjectRole(
  userId: string,
  projectId: string,
  /** When set (e.g. personal project owner), treated as owner without a member row. */
  ownerUserId?: string | null,
): Promise<ProjectRole | null> {
  if (ownerUserId != null && ownerUserId === userId) return "owner";
  const [row] = await db
    .select({ role: registryProjectMembers.role })
    .from(registryProjectMembers)
    .where(
      and(eq(registryProjectMembers.projectId, projectId), eq(registryProjectMembers.userId, userId)),
    )
    .limit(1);
  const r = row?.role;
  if (r === "owner" || r === "admin" || r === "editor" || r === "viewer") return r;
  return null;
}

export function roleCanEditProject(role: ProjectRole | null): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export function roleCanManageMembers(role: ProjectRole | null): boolean {
  return role === "owner" || role === "admin";
}

/** Load project row if the user may access it (member or personal owner). */
export async function getProjectIfAccessible(
  userId: string,
  projectId: string,
): Promise<RegistryProjectRow | null> {
  return getProjectIfAccessibleByLifecycle(userId, projectId, { includeArchived: false });
}

export async function getProjectIfAccessibleByLifecycle(
  userId: string,
  projectId: string,
  options: { includeArchived?: boolean } = {},
): Promise<RegistryProjectRow | null> {
  const [project] = await db
    .select()
    .from(registryProjects)
    .where(
      and(
        eq(registryProjects.id, projectId),
        options.includeArchived
          ? isNull(registryProjects.deletedAt)
          : activeProjectClause(),
      ),
    )
    .limit(1);
  if (!project) return null;
  if (project.ownerUserId === userId) return project;
  const role = await getUserProjectRole(userId, projectId);
  return role ? project : null;
}
