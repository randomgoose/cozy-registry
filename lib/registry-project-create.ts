import { getUserOrganizationRole } from "@/lib/workspace-context";
import { db } from "@/lib/db";
import { registryProjectMembers, registryProjects } from "@/lib/db/schema";
import { generateUniqueRegistryProjectSlug } from "@/lib/registry-project-slug";
import { resolvePublishTargetForUser } from "@/lib/publish-target";
import type { RegistryProjectRow } from "@/lib/project-permissions";

function isKebab(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

export type CreateRegistryProjectParams = {
  userId: string;
  title: string;
  description?: string | null;
  slug?: string | null;
  visibility?: "public" | "private";
  /**
   * Cookie session: active workspace org. When set, the project is created under this org
   * (same as POST /api/projects with a browser session). Ignores publishScope / targetRef.
   */
  sessionActiveOrganizationId?: string | null;
  publishScope?: "personal" | "organization" | "team";
  targetRef?: string | null;
  organizationSlug?: string | null;
};

export type CreateRegistryProjectResult =
  | { ok: true; project: RegistryProjectRow }
  | { ok: false; status: number; error: string };

/**
 * Create a registry project in personal scope or under an organization (editor+).
 * Used by HTTP API and MCP; does not depend on session activeOrganizationId.
 */
export async function createRegistryProject(
  params: CreateRegistryProjectParams,
): Promise<CreateRegistryProjectResult> {
  const title = params.title?.trim();
  if (!title) {
    return { ok: false, status: 400, error: "Missing required field: title" };
  }

  let activeOrganizationId: string | null = null;
  let ownerUserId: string | null = null;

  if (params.sessionActiveOrganizationId) {
    activeOrganizationId = params.sessionActiveOrganizationId;
    ownerUserId = null;
    const role = await getUserOrganizationRole(params.userId, activeOrganizationId);
    if (role !== "owner" && role !== "editor") {
      return {
        ok: false,
        status: 403,
        error: "You need editor access in this organization to create projects.",
      };
    }
  } else {
    const wantsOrganization =
      params.publishScope === "team" ||
      params.publishScope === "organization" ||
      (typeof params.targetRef === "string" && params.targetRef.trim().length > 0) ||
      (typeof params.organizationSlug === "string" && params.organizationSlug.trim().length > 0);

    const publishScope = wantsOrganization ? "organization" : "personal";

    const resolvedPublishTarget = await resolvePublishTargetForUser({
      userId: params.userId,
      publishScope,
      targetRef: typeof params.targetRef === "string" ? params.targetRef : null,
      organizationSlug:
        typeof params.organizationSlug === "string" ? params.organizationSlug : null,
    });

    if (!resolvedPublishTarget.ok) {
      const message =
        resolvedPublishTarget.code === "AMBIGUOUS_ORG_TARGET"
          ? `${resolvedPublishTarget.message} Use list_publish_targets and set targetRef (e.g. @acme) or organizationSlug.`
          : resolvedPublishTarget.message;
      const status =
        resolvedPublishTarget.code === "INVALID_ORG_TARGET"
          ? 404
          : resolvedPublishTarget.code === "NO_ORG_WRITE_ACCESS"
            ? 403
            : 400;
      return { ok: false, status, error: message };
    }

    const orgTarget =
      resolvedPublishTarget.target.kind === "organization"
        ? resolvedPublishTarget.target
        : null;

    activeOrganizationId = orgTarget?.id ?? null;
    ownerUserId = activeOrganizationId ? null : params.userId;
  }

  let slug: string;
  if (params.slug != null && String(params.slug).trim() !== "") {
    slug = String(params.slug).trim();
    if (!isKebab(slug)) {
      return {
        ok: false,
        status: 400,
        error: "slug must be kebab-case (e.g. marketing-blocks)",
      };
    }
  } else {
    slug = await generateUniqueRegistryProjectSlug({
      title,
      organizationId: activeOrganizationId,
      ownerUserId,
    });
  }

  const visibility = params.visibility === "public" ? "public" : "private";

  try {
    const [created] = await db
      .insert(registryProjects)
      .values({
        organizationId: activeOrganizationId,
        ownerUserId,
        slug,
        title,
        description: params.description ?? null,
        visibility,
      })
      .returning();

    if (!created) {
      return { ok: false, status: 500, error: "Failed to create project" };
    }

    await db.insert(registryProjectMembers).values({
      projectId: created.id,
      userId: params.userId,
      role: "owner",
    });

    return { ok: true, project: created };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create project";
    const isUnique = /\bduplicate key\b|\bunique constraint\b|23505/.test(msg);
    if (isUnique) {
      return { ok: false, status: 409, error: "Project slug already exists in this scope" };
    }
    const isMissingTable = /\brelation\b.*\bdoes not exist\b/i.test(msg);
    if (isMissingTable) {
      return {
        ok: false,
        status: 500,
        error:
          "Database schema is missing. Run migrations (e.g. pnpm db:push) against this environment's database.",
      };
    }
    return { ok: false, status: 500, error: msg };
  }
}
