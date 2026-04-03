import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { registryProjects } from "@/lib/db/schema";
import {
  getProjectIfAccessible,
  getUserProjectRole,
  roleCanEditProject,
  type RegistryProjectRow,
} from "@/lib/project-permissions";

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

export async function resolveCanonicalRegistryProjectForWrite(params: {
  userId: string;
  projectSlug: string | null | undefined;
  ownerUserId?: string | null;
  organizationId?: string | null;
}): Promise<
  | { ok: true; project: RegistryProjectRow | null }
  | { ok: false; error: string; status: number }
> {
  const slug = params.projectSlug?.trim() ?? "";
  if (!slug) {
    return { ok: true, project: null };
  }

  const ownershipClause = params.organizationId
    ? eq(registryProjects.organizationId, params.organizationId)
    : params.ownerUserId
      ? eq(registryProjects.ownerUserId, params.ownerUserId)
      : null;

  if (!ownershipClause) {
    return {
      ok: false,
      status: 400,
      error: "Project-scoped publish requires a resolved owner scope.",
    };
  }

  const [project] = await db
    .select()
    .from(registryProjects)
    .where(and(eq(registryProjects.slug, slug), ownershipClause))
    .limit(1);

  if (!project) {
    return {
      ok: false,
      status: 404,
      error: `Project "${slug}" not found in the target owner scope.`,
    };
  }

  const accessible = await getProjectIfAccessible(params.userId, project.id);
  if (!accessible) {
    return {
      ok: false,
      status: 403,
      error: `Project "${slug}" not found or no access.`,
    };
  }

  const role = await getUserProjectRole(
    params.userId,
    project.id,
    project.ownerUserId,
  );
  if (!roleCanEditProject(role)) {
    return {
      ok: false,
      status: 403,
      error: `You do not have permission to publish into project "${slug}".`,
    };
  }

  return { ok: true, project: accessible };
}
