import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@cozy/db";
import { projectItems, projects, registryItems } from "@cozy/db/schema";
import { resolveOwner } from "@cozy/registry-domain/owner";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

function isKebab(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

type ProjectsContext = Pick<PlatformRequestContext, "userId" | "activeTeamId">;

async function listProjectItemCounts(projectIds: string[]) {
  if (projectIds.length === 0) {
    return new Map<string, number>();
  }

  const links = await db
    .select({
      projectId: projectItems.projectId,
      itemId: projectItems.itemId,
    })
    .from(projectItems)
    .where(inArray(projectItems.projectId, projectIds));

  const counts = new Map<string, number>();
  for (const link of links) {
    counts.set(link.projectId, (counts.get(link.projectId) ?? 0) + 1);
  }
  return counts;
}

async function getOwnedProject(input: {
  context: ProjectsContext;
  id: string;
}) {
  const { userId, activeTeamId } = input.context;
  if (!userId) {
    return null;
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.id),
        activeTeamId ? eq(projects.ownerTeamId, activeTeamId) : eq(projects.ownerUserId, userId),
      ),
    )
    .limit(1);

  return project ?? null;
}

export async function listProjects(input: {
  context: ProjectsContext;
  owner?: string | null;
}) {
  const ownerParam = input.owner?.trim() ?? null;

  if (!ownerParam) {
    if (!input.context.userId) {
      return {
        status: 401,
        body: { error: "Authentication required (owner not specified)" },
      };
    }

    const rows = await db
      .select({
        id: projects.id,
        ownerUserId: projects.ownerUserId,
        ownerTeamId: projects.ownerTeamId,
        slug: projects.slug,
        title: projects.title,
        description: projects.description,
        visibility: projects.visibility,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(
        input.context.activeTeamId
          ? eq(projects.ownerTeamId, input.context.activeTeamId)
          : eq(projects.ownerUserId, input.context.userId),
      )
      .orderBy(projects.slug);

    const counts = await listProjectItemCounts(rows.map((row) => row.id));
    return {
      status: 200,
      body: {
        projects: rows.map((row) => ({
          ...row,
          itemCount: counts.get(row.id) ?? 0,
        })),
      },
    };
  }

  const resolved = await resolveOwner(ownerParam);
  if (!resolved) {
    return { status: 200, body: { projects: [] } };
  }

  const canSeePrivate = input.context.userId != null && resolved.userId === input.context.userId;

  const rows = await db
    .select({
      id: projects.id,
      ownerUserId: projects.ownerUserId,
      slug: projects.slug,
      title: projects.title,
      description: projects.description,
      visibility: projects.visibility,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(
      and(
        eq(projects.ownerUserId, resolved.userId),
        canSeePrivate
          ? or(eq(projects.visibility, "public"), eq(projects.visibility, "private"))
          : eq(projects.visibility, "public"),
      ),
    )
    .orderBy(projects.slug);

  const counts = await listProjectItemCounts(rows.map((row) => row.id));
  return {
    status: 200,
    body: {
      projects: rows.map((row) => ({
        ...row,
        itemCount: counts.get(row.id) ?? 0,
      })),
    },
  };
}

export async function createProjectFromBody(input: {
  context: ProjectsContext;
  body: {
    slug?: string;
    title?: string;
    description?: string | null;
    visibility?: "public" | "private";
  } | null;
}) {
  if (!input.context.userId) {
    return {
      status: 401,
      body: {
        error:
          "Authentication required. Sign in or provide Authorization: Bearer <token>",
      },
    };
  }

  if (!input.body?.slug || !input.body?.title) {
    return {
      status: 400,
      body: { error: "Missing required fields: slug, title" },
    };
  }

  if (!isKebab(input.body.slug)) {
    return {
      status: 400,
      body: { error: "slug must be kebab-case (e.g. marketing-blocks)" },
    };
  }

  const visibility = input.body.visibility === "public" ? "public" : "private";

  try {
    const [created] = await db
      .insert(projects)
      .values({
        ownerUserId: input.context.activeTeamId ? null : input.context.userId,
        ownerTeamId: input.context.activeTeamId,
        slug: input.body.slug,
        title: input.body.title,
        description: input.body.description ?? null,
        visibility,
      })
      .returning();

    return { status: 200, body: { project: created } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create project";
    const isUnique = /\bduplicate key\b|\bunique constraint\b|23505/.test(message);
    if (isUnique) {
      return {
        status: 409,
        body: { error: "Project slug already exists" },
      };
    }

    const isMissingTable = /\brelation\b.*\bdoes not exist\b/i.test(message);
    if (isMissingTable) {
      return {
        status: 500,
        body: {
          error:
            "Database schema is missing. Run migrations (e.g. pnpm db:push) against this environment's database.",
        },
      };
    }

    return { status: 500, body: { error: message } };
  }
}

export async function listProjectItems(input: {
  context: ProjectsContext;
  id: string;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const project = await getOwnedProject(input);
  if (!project) {
    return { status: 404, body: { error: "Not found" } };
  }

  const rows = await db
    .select({
      itemId: registryItems.id,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      addedAt: projectItems.addedAt,
    })
    .from(projectItems)
    .innerJoin(registryItems, eq(projectItems.itemId, registryItems.id))
    .where(eq(projectItems.projectId, input.id))
    .orderBy(registryItems.name);

  return { status: 200, body: { items: rows } };
}

export async function addItemToProject(input: {
  context: ProjectsContext;
  id: string;
  body: { itemId?: string } | null;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  if (!input.body?.itemId) {
    return {
      status: 400,
      body: { error: "Missing required field: itemId" },
    };
  }

  const project = await getOwnedProject(input);
  if (!project) {
    return { status: 404, body: { error: "Not found" } };
  }

  const [item] = await db
    .select({ id: registryItems.id })
    .from(registryItems)
    .where(
      and(
        eq(registryItems.id, input.body.itemId),
        input.context.activeTeamId
          ? eq(registryItems.teamId, input.context.activeTeamId)
          : eq(registryItems.userId, input.context.userId),
      ),
    )
    .limit(1);

  if (!item) {
    return { status: 404, body: { error: "Item not found" } };
  }

  try {
    await db.insert(projectItems).values({
      projectId: input.id,
      itemId: input.body.itemId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add item";
    const isUnique = /\bduplicate key\b|\bunique constraint\b|23505/.test(message);
    if (isUnique) {
      return {
        status: 409,
        body: { error: "Item already exists in this project" },
      };
    }
    return { status: 500, body: { error: message } };
  }

  return { status: 200, body: { success: true } };
}

export async function removeItemFromProject(input: {
  context: ProjectsContext;
  id: string;
  itemId: string;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const project = await getOwnedProject(input);
  if (!project) {
    return { status: 404, body: { error: "Not found" } };
  }

  await db
    .delete(projectItems)
    .where(and(eq(projectItems.projectId, input.id), eq(projectItems.itemId, input.itemId)));

  return { status: 200, body: { success: true } };
}

export async function updateProjectFromBody(input: {
  context: ProjectsContext;
  id: string;
  body:
    | {
        slug?: string;
        title?: string;
        description?: string | null;
        visibility?: "public" | "private";
      }
    | null;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  if (!input.body) {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  if (input.body.slug != null && !isKebab(input.body.slug)) {
    return { status: 400, body: { error: "slug must be kebab-case" } };
  }

  const [updated] = await db
    .update(projects)
    .set({
      ...(input.body.slug != null ? { slug: input.body.slug } : {}),
      ...(input.body.title != null ? { title: input.body.title } : {}),
      ...(input.body.description !== undefined ? { description: input.body.description } : {}),
      ...(input.body.visibility != null
        ? {
            visibility: input.body.visibility === "public" ? "public" : "private",
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projects.id, input.id),
        input.context.activeTeamId ? eq(projects.ownerTeamId, input.context.activeTeamId) : eq(projects.ownerUserId, input.context.userId),
      ),
    )
    .returning();

  if (!updated) {
    return { status: 404, body: { error: "Not found" } };
  }

  return { status: 200, body: { project: updated } };
}

export async function deleteProject(input: {
  context: ProjectsContext;
  id: string;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const [deleted] = await db
    .delete(projects)
    .where(
      and(
        eq(projects.id, input.id),
        input.context.activeTeamId ? eq(projects.ownerTeamId, input.context.activeTeamId) : eq(projects.ownerUserId, input.context.userId),
      ),
    )
    .returning();

  if (!deleted) {
    return { status: 404, body: { error: "Not found" } };
  }

  return { status: 200, body: { success: true } };
}
