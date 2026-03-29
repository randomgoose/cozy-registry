import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { getProjectScopeContext } from "@/lib/project-scope";
import { resolveOwner } from "@/lib/owner";
import {
  registryItems,
  registryProjectItems,
  registryProjectMembers,
  registryProjects,
} from "@/lib/db/schema";
import { createRegistryProject } from "@/lib/registry-project-create";

export async function POST(request: Request) {
  const { userId, activeOrganizationId } = await getProjectScopeContext(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Sign in or provide Authorization: Bearer <token>" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        slug?: string;
        title?: string;
        description?: string | null;
        visibility?: "public" | "private";
      }
    | null;
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "Missing required field: title" }, { status: 400 });
  }

  const result = await createRegistryProject({
    userId,
    title: body.title.trim(),
    description: body.description ?? null,
    slug: body.slug != null ? String(body.slug) : null,
    visibility: body.visibility,
    sessionActiveOrganizationId: activeOrganizationId ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ project: result.project });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ownerParam = url.searchParams.get("owner");

  const { userId: requestUserId, activeOrganizationId } = await getProjectScopeContext(request);

  if (!ownerParam) {
    if (!requestUserId) {
      return NextResponse.json(
        { error: "Authentication required (owner not specified)" },
        { status: 401 },
      );
    }

    const memberProjectIds = await db
      .select({ projectId: registryProjectMembers.projectId })
      .from(registryProjectMembers)
      .where(eq(registryProjectMembers.userId, requestUserId));

    const memberSet = new Set(memberProjectIds.map((r) => r.projectId));
    if (memberSet.size === 0) {
      return NextResponse.json({ projects: [] });
    }

    if (activeOrganizationId) {
      const rows = await db
        .select({
          id: registryProjects.id,
          organizationId: registryProjects.organizationId,
          ownerUserId: registryProjects.ownerUserId,
          slug: registryProjects.slug,
          title: registryProjects.title,
          description: registryProjects.description,
          visibility: registryProjects.visibility,
          createdAt: registryProjects.createdAt,
          updatedAt: registryProjects.updatedAt,
        })
        .from(registryProjects)
        .where(
          and(
            eq(registryProjects.organizationId, activeOrganizationId),
            inArray(registryProjects.id, [...memberSet]),
          ),
        )
        .orderBy(registryProjects.slug);

      const ids = rows.map((r) => r.id);
      const [counts, previews] = await Promise.all([
        itemCountsForProjects(ids),
        previewItemsForProjects(ids),
      ]);
      return NextResponse.json({
        projects: rows.map((r) => ({
          ...r,
          itemCount: counts.get(r.id) ?? 0,
          previewItems: previews.get(r.id) ?? [],
        })),
      });
    }

    const rows = await db
      .select({
        id: registryProjects.id,
        organizationId: registryProjects.organizationId,
        ownerUserId: registryProjects.ownerUserId,
        slug: registryProjects.slug,
        title: registryProjects.title,
        description: registryProjects.description,
        visibility: registryProjects.visibility,
        createdAt: registryProjects.createdAt,
        updatedAt: registryProjects.updatedAt,
      })
      .from(registryProjects)
      .where(
        and(
          eq(registryProjects.ownerUserId, requestUserId),
          inArray(registryProjects.id, [...memberSet]),
        ),
      )
      .orderBy(registryProjects.slug);

    const ids = rows.map((r) => r.id);
    const [counts, previews] = await Promise.all([
      itemCountsForProjects(ids),
      previewItemsForProjects(ids),
    ]);
    return NextResponse.json({
      projects: rows.map((r) => ({
        ...r,
        itemCount: counts.get(r.id) ?? 0,
        previewItems: previews.get(r.id) ?? [],
      })),
    });
  }

  const resolved = await resolveOwner(ownerParam);
  if (!resolved) {
    return NextResponse.json({ projects: [] });
  }

  const canSeePrivate = requestUserId != null && resolved.userId === requestUserId;
  const rows = await db
    .select({
      id: registryProjects.id,
      ownerUserId: registryProjects.ownerUserId,
      slug: registryProjects.slug,
      title: registryProjects.title,
      description: registryProjects.description,
      visibility: registryProjects.visibility,
      createdAt: registryProjects.createdAt,
      updatedAt: registryProjects.updatedAt,
    })
    .from(registryProjects)
    .where(
      and(
        eq(registryProjects.ownerUserId, resolved.userId),
        canSeePrivate
          ? or(eq(registryProjects.visibility, "public"), eq(registryProjects.visibility, "private"))
          : eq(registryProjects.visibility, "public"),
      ),
    )
    .orderBy(registryProjects.slug);

  const ids = rows.map((r) => r.id);
  const [counts, previews] = await Promise.all([
    itemCountsForProjects(ids),
    previewItemsForProjects(ids),
  ]);
  return NextResponse.json({
    projects: rows.map((r) => ({
      ...r,
      itemCount: counts.get(r.id) ?? 0,
      previewItems: previews.get(r.id) ?? [],
    })),
  });
}

/** Up to 4 most recently linked items per project (for list cards). */
async function previewItemsForProjects(
  projectIds: string[],
): Promise<Map<string, Array<{ title: string; name: string; type: string }>>> {
  const map = new Map<string, Array<{ title: string; name: string; type: string }>>();
  if (projectIds.length === 0) return map;
  for (const id of projectIds) {
    map.set(id, []);
  }

  const rows = await db
    .select({
      projectId: registryProjectItems.projectId,
      title: registryItems.title,
      name: registryItems.name,
      type: registryItems.type,
    })
    .from(registryProjectItems)
    .innerJoin(registryItems, eq(registryProjectItems.itemId, registryItems.id))
    .where(inArray(registryProjectItems.projectId, projectIds))
    .orderBy(desc(registryProjectItems.addedAt));

  for (const row of rows) {
    const list = map.get(row.projectId);
    if (!list || list.length >= 4) continue;
    list.push({ title: row.title, name: row.name, type: row.type });
  }
  return map;
}

async function itemCountsForProjects(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const links = await db
    .select({
      projectId: registryProjectItems.projectId,
      itemId: registryProjectItems.itemId,
    })
    .from(registryProjectItems)
    .where(inArray(registryProjectItems.projectId, projectIds));
  const map = new Map<string, number>();
  for (const l of links) {
    map.set(l.projectId, (map.get(l.projectId) ?? 0) + 1);
  }
  return map;
}
