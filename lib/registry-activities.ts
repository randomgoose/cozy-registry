import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { db } from "@/lib/db";
import { organization, registryActivities, registryProjects, user } from "@/lib/db/schema";
import { getOrganizationCanonicalOwnerRef } from "@/lib/registry-organization";

export type InsertRegistryActivityRow = InferInsertModel<typeof registryActivities>;

/** Call from publish / lifecycle handlers once events are wired. */
export async function insertRegistryActivity(
  row: InsertRegistryActivityRow,
): Promise<string | null> {
  const [inserted] = await db
    .insert(registryActivities)
    .values(row)
    .returning({ id: registryActivities.id });
  return inserted?.id ?? null;
}

export const REGISTRY_ACTIVITY_EVENT_TYPES = [
  "item.created",
  "item.version_published",
  "item.metadata_updated",
  "item.archived",
  "item.restored",
  "item.deleted",
] as const;

export type RegistryActivityEventType = (typeof REGISTRY_ACTIVITY_EVENT_TYPES)[number];
export type RegistryActivityActorType = "user" | "agent" | "system";

export type RegistryActivityItemSnapshot = {
  id: string;
  userId: string | null;
  organizationId: string | null;
  canonicalProjectId: string | null;
  name: string;
  type: string;
  title: string;
};

export type ActivityListItem = {
  id: string;
  createdAt: string;
  eventType: string;
  actorType: string;
  actorUserId: string | null;
  actorName: string | null;
  actorHandle: string | null;
  resourceType: string;
  resourceName: string;
  resourceTitle: string | null;
  resourceOwnerRef: string | null;
  versionLabel: string | null;
  metadata: Record<string, unknown>;
  contextKind: "project" | "workspace" | "personal";
  contextLabel: string;
};

export type ListRegistryActivitiesScope =
  | { kind: "personal"; userId: string }
  | { kind: "organization"; organizationId: string }
  | { kind: "project"; projectId: string };

export type ListRegistryActivitiesParams = {
  scope: ListRegistryActivitiesScope;
  limit: number;
  cursor?: { createdAt: Date; id: string } | null;
  eventTypes?: string[] | null;
};

function scopeWhereClause(scope: ListRegistryActivitiesScope) {
  switch (scope.kind) {
    case "personal":
      return and(
        eq(registryActivities.ownerUserId, scope.userId),
        isNull(registryActivities.organizationId),
      );
    case "organization":
      return eq(registryActivities.organizationId, scope.organizationId);
    case "project":
      return eq(registryActivities.canonicalProjectId, scope.projectId);
    default: {
      const _never: never = scope;
      return _never;
    }
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({
    t: createdAt.toISOString(),
    id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

async function resolveRegistryActivityOwnerRef(
  item: RegistryActivityItemSnapshot,
): Promise<string | null> {
  if (item.organizationId) {
    return (await getOrganizationCanonicalOwnerRef(item.organizationId)) ?? item.organizationId;
  }

  if (item.userId) {
    const [ownerRow] = await db
      .select({ handle: user.handle })
      .from(user)
      .where(eq(user.id, item.userId))
      .limit(1);
    return ownerRow?.handle?.trim() || item.userId;
  }

  return null;
}

export async function recordRegistryItemActivity(params: {
  item: RegistryActivityItemSnapshot;
  eventType: RegistryActivityEventType;
  actorUserId?: string | null;
  actorType?: RegistryActivityActorType;
  itemVersionId?: string | null;
  versionLabel?: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string | null;
}): Promise<string | null> {
  const resourceOwnerRef = await resolveRegistryActivityOwnerRef(params.item);

  return insertRegistryActivity({
    organizationId: params.item.organizationId,
    ownerUserId: params.item.userId,
    canonicalProjectId: params.item.canonicalProjectId,
    itemId: params.item.id,
    itemVersionId: params.itemVersionId ?? null,
    actorUserId: params.actorUserId ?? null,
    actorType: params.actorType ?? "user",
    eventType: params.eventType,
    resourceType: params.item.type,
    resourceName: params.item.name,
    resourceTitle: params.item.title,
    resourceOwnerRef,
    versionLabel: params.versionLabel ?? null,
    metadata: params.metadata ?? {},
    correlationId: params.correlationId ?? null,
  });
}

export function decodeActivityCursor(raw: string | null): { createdAt: Date; id: string } | null {
  if (!raw?.trim()) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { t?: string; id?: string };
    if (typeof parsed.t !== "string" || typeof parsed.id !== "string") return null;
    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function listRegistryActivities(
  params: ListRegistryActivitiesParams,
): Promise<{ items: ActivityListItem[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = Math.min(Math.max(params.limit, 1), 100);
  const scopeFilter = scopeWhereClause(params.scope);
  const typeFilter =
    params.eventTypes && params.eventTypes.length > 0
      ? inArray(registryActivities.eventType, params.eventTypes)
      : undefined;

  const cursorFilter = params.cursor
    ? or(
        lt(registryActivities.createdAt, params.cursor.createdAt),
        and(
          eq(registryActivities.createdAt, params.cursor.createdAt),
          lt(registryActivities.id, params.cursor.id),
        ),
      )
    : undefined;

  const whereParts = [scopeFilter];
  if (typeFilter) whereParts.push(typeFilter);
  if (cursorFilter) whereParts.push(cursorFilter);
  const where = and(...whereParts);

  const rows = await db
    .select({
      id: registryActivities.id,
      createdAt: registryActivities.createdAt,
      eventType: registryActivities.eventType,
      actorType: registryActivities.actorType,
      actorUserId: registryActivities.actorUserId,
      resourceType: registryActivities.resourceType,
      resourceName: registryActivities.resourceName,
      resourceTitle: registryActivities.resourceTitle,
      resourceOwnerRef: registryActivities.resourceOwnerRef,
      versionLabel: registryActivities.versionLabel,
      metadata: registryActivities.metadata,
      actorName: user.name,
      actorHandle: user.handle,
      organizationName: organization.name,
      projectTitle: registryProjects.title,
    })
    .from(registryActivities)
    .leftJoin(user, eq(registryActivities.actorUserId, user.id))
    .leftJoin(organization, eq(registryActivities.organizationId, organization.id))
    .leftJoin(registryProjects, eq(registryActivities.canonicalProjectId, registryProjects.id))
    .where(where)
    .orderBy(desc(registryActivities.createdAt), desc(registryActivities.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last?.createdAt
      ? encodeCursor(last.createdAt, last.id)
      : null;

  const items: ActivityListItem[] = page.map((r) => {
    const projectTitle = r.projectTitle?.trim() || null;
    const organizationName = r.organizationName?.trim() || null;
    const contextKind =
      projectTitle != null ? "project" : organizationName != null ? "workspace" : "personal";
    const contextLabel = projectTitle ?? organizationName ?? "Personal";

    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      eventType: r.eventType,
      actorType: r.actorType,
      actorUserId: r.actorUserId,
      actorName: r.actorName,
      actorHandle: r.actorHandle,
      resourceType: r.resourceType,
      resourceName: r.resourceName,
      resourceTitle: r.resourceTitle,
      resourceOwnerRef: r.resourceOwnerRef,
      versionLabel: r.versionLabel,
      metadata:
        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {},
      contextKind,
      contextLabel,
    };
  });

  return { items, nextCursor, hasMore };
}

export function activityPrimaryLine(item: ActivityListItem, viewerUserId: string): string {
  const actor =
    item.actorType === "system"
      ? "System"
      : item.actorType === "agent"
        ? "AI agent"
        : item.actorUserId === viewerUserId
          ? "You"
          : item.actorName?.trim() ||
            (item.actorHandle ? `@${item.actorHandle}` : "Someone");

  const res = item.resourceTitle?.trim() || item.resourceName;
  const v = item.versionLabel?.trim();
  const changedFields = Array.isArray(item.metadata.changedFields)
    ? item.metadata.changedFields.filter((value): value is string => typeof value === "string")
    : [];

  switch (item.eventType) {
    case "item.created":
      return `${actor} created ${res}`;
    case "item.version_published":
      return v ? `${actor} published v${v} of ${res}` : `${actor} published a new version of ${res}`;
    case "item.metadata_updated":
      if (changedFields.length === 1 && changedFields[0] === "visibility") {
        return `${actor} updated visibility for ${res}`;
      }
      return `${actor} updated details for ${res}`;
    case "item.archived":
      return `${actor} archived ${res}`;
    case "item.restored":
      return `${actor} restored ${res}`;
    case "item.deleted":
      return `${actor} deleted ${res}`;
    default:
      return `${actor} updated ${res}`;
  }
}

export function activityResourceHref(item: ActivityListItem): string | null {
  const owner = item.resourceOwnerRef?.trim();
  if (!owner || !item.resourceName) return null;
  return `/registry/${encodeURIComponent(owner)}/${encodeURIComponent(item.resourceName)}`;
}

export function resourceTypeShortLabel(resourceType: string): string {
  if (resourceType === "registry:ui") return "UI";
  if (resourceType === "registry:block") return "Block";
  if (resourceType === "registry:theme") return "Theme";
  if (resourceType === "registry:project") return "Project";
  return resourceType.replace(/^registry:/, "") || "Item";
}
