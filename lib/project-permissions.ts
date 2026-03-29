import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

import { db } from "@/lib/db";
import { registryProjectMembers, registryProjects } from "@/lib/db/schema";

export type ProjectRole = "owner" | "admin" | "editor" | "viewer";

export type RegistryProjectRow = InferSelectModel<typeof registryProjects>;

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
  const [project] = await db
    .select()
    .from(registryProjects)
    .where(eq(registryProjects.id, projectId))
    .limit(1);
  if (!project) return null;
  if (project.ownerUserId === userId) return project;
  const role = await getUserProjectRole(userId, projectId);
  return role ? project : null;
}
