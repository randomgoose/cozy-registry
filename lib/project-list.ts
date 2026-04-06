import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  registryItems,
  registryProjectItems,
  registryProjectMembers,
  registryProjects,
} from "@/lib/db/schema";
import { resolveOwner } from "@/lib/owner";
import { createServerTimingLogger } from "@/lib/server-timing";

export type ProjectListItem = {
  id: string;
  organizationId: string | null;
  ownerUserId: string | null;
  namespaceKey: string;
  defaultThemeResourceRef: string | null;
  slug: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  previewItems: Array<{ title: string; name: string; type: string }>;
};

type BaseProjectRow = Omit<ProjectListItem, "itemCount" | "previewItems">;

function normalizeVisibility(value: string): "public" | "private" {
  return value === "private" ? "private" : "public";
}

function withProjectSummaries(rows: BaseProjectRow[]): Promise<ProjectListItem[]> {
  return hydrateProjects(rows);
}

export async function listProjectsForScope(params: {
  userId: string;
  activeOrganizationId: string | null;
}): Promise<ProjectListItem[]> {
  const timings = createServerTimingLogger("project-list.scope", {
    userId: params.userId,
    activeOrganizationId: params.activeOrganizationId,
  });
  let stepStartedAt = performance.now();
  const memberProjectIds = await db
    .select({ projectId: registryProjectMembers.projectId })
    .from(registryProjectMembers)
    .where(eq(registryProjectMembers.userId, params.userId));
  timings.mark("memberProjectIdsQuery", stepStartedAt);

  const memberIds = [...new Set(memberProjectIds.map((row) => row.projectId))];
  if (memberIds.length === 0) {
    timings.flush({ projectCount: 0, outcome: "empty" });
    return [];
  }

  if (params.activeOrganizationId) {
    stepStartedAt = performance.now();
    const rows = await db
      .select({
        id: registryProjects.id,
        organizationId: registryProjects.organizationId,
        ownerUserId: registryProjects.ownerUserId,
        namespaceKey: registryProjects.namespaceKey,
        defaultThemeResourceRef: registryProjects.defaultThemeResourceRef,
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
          eq(registryProjects.organizationId, params.activeOrganizationId),
          inArray(registryProjects.id, memberIds),
        ),
      )
      .orderBy(registryProjects.slug);
    timings.mark("projectListQuery", stepStartedAt);

    const projects = await withProjectSummaries(rows.map((row) => ({
      ...row,
      visibility: normalizeVisibility(row.visibility),
    })));
    timings.flush({
      projectCount: projects.length,
      scope: "organization",
      outcome: "ok",
    });
    return projects;
  }

  stepStartedAt = performance.now();
  const rows = await db
    .select({
      id: registryProjects.id,
      organizationId: registryProjects.organizationId,
      ownerUserId: registryProjects.ownerUserId,
      namespaceKey: registryProjects.namespaceKey,
      defaultThemeResourceRef: registryProjects.defaultThemeResourceRef,
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
        eq(registryProjects.ownerUserId, params.userId),
        inArray(registryProjects.id, memberIds),
      ),
    )
    .orderBy(registryProjects.slug);
  timings.mark("projectListQuery", stepStartedAt);

  const projects = await withProjectSummaries(rows.map((row) => ({
    ...row,
    visibility: normalizeVisibility(row.visibility),
  })));
  timings.flush({
    projectCount: projects.length,
    scope: "personal",
    outcome: "ok",
  });
  return projects;
}

export async function listProjectsForOwner(params: {
  owner: string;
  requestUserId: string | null;
}): Promise<ProjectListItem[]> {
  const timings = createServerTimingLogger("project-list.owner", {
    owner: params.owner,
    requestUserId: params.requestUserId,
  });
  let stepStartedAt = performance.now();
  const resolved = await resolveOwner(params.owner);
  timings.mark("ownerResolution", stepStartedAt);
  if (!resolved) {
    timings.flush({ projectCount: 0, outcome: "owner-not-found" });
    return [];
  }

  const canSeePrivate =
    params.requestUserId != null && resolved.userId === params.requestUserId;

  stepStartedAt = performance.now();
  const rows = await db
    .select({
      id: registryProjects.id,
      organizationId: registryProjects.organizationId,
      ownerUserId: registryProjects.ownerUserId,
      namespaceKey: registryProjects.namespaceKey,
      defaultThemeResourceRef: registryProjects.defaultThemeResourceRef,
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
  timings.mark("projectListQuery", stepStartedAt);

  const projects = await withProjectSummaries(rows.map((row) => ({
    ...row,
    visibility: normalizeVisibility(row.visibility),
  })));
  timings.flush({
    projectCount: projects.length,
    outcome: "ok",
  });
  return projects;
}

async function hydrateProjects(rows: BaseProjectRow[]): Promise<ProjectListItem[]> {
  const timings = createServerTimingLogger("project-list.hydrate", {
    projectCount: rows.length,
  });
  const ids = rows.map((row) => row.id);
  const stepStartedAt = performance.now();
  const countsPromise = itemCountsForProjects(ids);
  const previewsPromise = previewItemsForProjects(ids);
  const [counts, previews] = await Promise.all([countsPromise, previewsPromise]);
  timings.mark("itemCountsQueryAndPreviewItemsQuery", stepStartedAt);

  const hydrated = rows.map((row) => ({
    ...row,
    itemCount: counts.get(row.id) ?? 0,
    previewItems: previews.get(row.id) ?? [],
  }));
  timings.flush({ outcome: "ok" });
  return hydrated;
}

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
  for (const link of links) {
    map.set(link.projectId, (map.get(link.projectId) ?? 0) + 1);
  }
  return map;
}
