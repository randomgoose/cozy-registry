import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  registryItems,
  registryFiles,
  registryItemVersions,
  registryFileVersions,
  registryItemMoves,
  registryProjectItems,
  registryProjects,
  organization,
  user,
} from "@/lib/db/schema";
import { resolveOwner } from "@/lib/owner";
import {
  getOrganizationCanonicalOwnerRef,
  isUserOrganizationMember,
  resolveOrganizationBySlug,
  resolveOrganizationIdFromLegacyOwnerPath,
} from "@/lib/registry-organization";
import { parseTeamOwnerPath } from "@/lib/registry-team";
import { getWritableOrganizationTargetForUser } from "@/lib/publish-target";
import type { RegistryPolicy } from "@/lib/registry-policy";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { maybeBuildRegistryThumbnail } from "@/lib/thumbnail";
import { enqueueThumbnailJob } from "@/lib/thumbnail-jobs";
import {
  enqueuePreviewArtifactJob,
  enqueueWarmPreviewArtifacts,
} from "@/lib/preview-artifact-jobs";
import { buildDependencySnapshot } from "@/lib/third-party-dependency-governance";

const INITIAL_VERSION = "0.1.0";
const DEFAULT_COMPONENT_ENTRY_PATH = "index.tsx";
const ACTIVE_REGISTRY_ITEM_STATUS = "active";
const ARCHIVED_REGISTRY_ITEM_STATUS = "archived";
const DELETED_REGISTRY_ITEM_STATUS = "deleted";

export type RegistryItemLifecycleStatus =
  | typeof ACTIVE_REGISTRY_ITEM_STATUS
  | typeof ARCHIVED_REGISTRY_ITEM_STATUS
  | typeof DELETED_REGISTRY_ITEM_STATUS;

// owner resolution is centralized in lib/owner.ts

function withCozyHeader(params: {
  ownerId: string | null | undefined;
  name: string;
  version: string;
  content: string;
  /** 为 theme 等非 JS 文件使用 CSS 注释头，避免破坏语法 */
  format?: "js" | "css";
}) {
  const owner = params.ownerId ?? "legacy";
  const isCss = params.format === "css";
  const header = isCss
    ? `/* cozy-registry: @${owner}/${params.name} v${params.version} */\n`
    : `// cozy-registry: @${owner}/${params.name} v${params.version}\n`;
  if (params.content.startsWith("// cozy-registry:") || params.content.startsWith("/* cozy-registry:")) {
    return params.content;
  }
  return `${header}${params.content}`;
}

function getDefaultRegistryEntryPath(type: string): string {
  return normalizeRegistryItemType(type) === REGISTRY_THEME_TYPE
    ? "theme.css"
    : DEFAULT_COMPONENT_ENTRY_PATH;
}

function isRegistryItemDirectlyResolvableStatus(status: string | null | undefined) {
  return status === ACTIVE_REGISTRY_ITEM_STATUS || status === ARCHIVED_REGISTRY_ITEM_STATUS;
}

function ensureRegistryItemMutable(status: string | null | undefined) {
  if (status === ARCHIVED_REGISTRY_ITEM_STATUS) {
    throw new Error("Archived items cannot be modified");
  }
  if (status === DELETED_REGISTRY_ITEM_STATUS) {
    throw new Error("Deleted items cannot be modified");
  }
}

/** 根据 bump 类型计算下一版本号（简单 semver） */
export function bumpVersion(
  current: string,
  bump: "patch" | "minor" | "major"
): string {
  const parts = current.split(".").map((s) => parseInt(s, 10) || 0);
  const [major = 0, minor = 0, patch = 0] = parts;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Get registry items. If userId is provided, returns public items + owner's private items.
 * If userId is null, returns only public items.
 * Items include ownerId (userId) for per-user namespacing.
 */
export async function getRegistryItems(
  userId?: string | null,
  pagination?: { limit?: number; offset?: number } | null,
) {
  const base = db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      ownerHandle: user.handle,
      canonicalProjectKey: registryItems.canonicalProjectKey,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      status: registryItems.status,
      archivedAt: registryItems.archivedAt,
      deletedAt: registryItems.deletedAt,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id))
    .where(
      and(
        userId
          ? or(
              eq(registryItems.visibility, "public"),
              and(
                eq(registryItems.visibility, "private"),
                eq(registryItems.userId, userId),
              ),
            )
          : eq(registryItems.visibility, "public"),
        eq(registryItems.status, ACTIVE_REGISTRY_ITEM_STATUS),
      ),
    )
    .orderBy(registryItems.name);

  if (pagination?.limit != null) {
    if (pagination.offset != null && pagination.offset > 0) {
      return base.limit(pagination.limit).offset(pagination.offset);
    }
    return base.limit(pagination.limit);
  }
  if (pagination?.offset != null && pagination.offset > 0) {
    return base.offset(pagination.offset);
  }
  return base;
}

export type RegistryScope = {
  requestUserId: string | null;
  policy: RegistryPolicy | null;
  /** When set, applies SQL LIMIT (e.g. MCP pagination). */
  listLimit?: number;
  /** When set, applies SQL OFFSET (e.g. MCP pagination). */
  listOffset?: number;
};

export async function getRegistryItemsScoped(scope: RegistryScope) {
  const { requestUserId, policy, listLimit, listOffset } = scope;
  const pagination =
    listLimit != null || (listOffset != null && listOffset > 0)
      ? { limit: listLimit, offset: listOffset }
      : null;

  // No policy row: keep existing behavior.
  if (!policy) {
    return getRegistryItems(requestUserId, pagination);
  }

  const allowedProjectIds = policy.allowedProjectIds ?? [];
  const allowPublicOutsideProjects = !!policy.allowPublicOutsideProjects;

  // Strict allowlist behavior:
  // - If no projects are allowlisted and public-outside is false, deny all.
  if (allowedProjectIds.length === 0 && !allowPublicOutsideProjects) {
    return [];
  }

  const allowedTypes = (policy.allowedTypes ?? []).filter(Boolean);
  const allowedOwners = (policy.allowedOwnerHandlesOrIds ?? []).filter(Boolean);

  const allowedItemIds = (() => {
    if (allowedProjectIds.length === 0) return [] as string[];
    return db
      .select({ itemId: registryProjectItems.itemId })
      .from(registryProjectItems)
      .where(inArray(registryProjectItems.projectId, allowedProjectIds));
  })();

  const organizationPolicyId = policy.ownerOrganizationId ?? null;
  const visibleClause = requestUserId
    ? or(
        eq(registryItems.visibility, "public"),
        and(eq(registryItems.visibility, "private"), eq(registryItems.userId, requestUserId)),
        ...(organizationPolicyId
          ? [
              and(
                eq(registryItems.visibility, "private"),
                eq(registryItems.organizationId, organizationPolicyId),
              ),
            ]
          : []),
      )
    : eq(registryItems.visibility, "public");

  const base = db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      organizationId: registryItems.organizationId,
      canonicalProjectKey: registryItems.canonicalProjectKey,
      ownerHandle: user.handle,
      orgSlug: organization.slug,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      status: registryItems.status,
      archivedAt: registryItems.archivedAt,
      deletedAt: registryItems.deletedAt,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id))
    .leftJoin(organization, eq(registryItems.organizationId, organization.id));

  const clauses = [
    visibleClause,
    eq(registryItems.status, ACTIVE_REGISTRY_ITEM_STATUS),
  ] as ReturnType<typeof and>[];

  if (allowedTypes.length > 0) {
    clauses.push(inArray(registryItems.type, allowedTypes));
  }

  if (allowedOwners.length > 0) {
    const byUser = or(
      inArray(registryItems.userId, allowedOwners),
      inArray(user.handle, allowedOwners),
    );
    clauses.push(
      organizationPolicyId
        ? or(byUser, eq(registryItems.organizationId, organizationPolicyId))
        : byUser,
    );
  }

  if (allowedProjectIds.length > 0) {
    if (allowPublicOutsideProjects) {
      // Public items may be outside projects; non-public items must be in an allowed project.
      clauses.push(
        or(
          eq(registryItems.visibility, "public"),
          inArray(registryItems.id, allowedItemIds),
        ),
      );
    } else {
      clauses.push(inArray(registryItems.id, allowedItemIds));
    }
  }

  const listed = base.where(and(...clauses)).orderBy(registryItems.name);
  if (listLimit != null) {
    if (listOffset != null && listOffset > 0) {
      return listed.limit(listLimit).offset(listOffset);
    }
    return listed.limit(listLimit);
  }
  if (listOffset != null && listOffset > 0) {
    return listed.offset(listOffset);
  }
  return listed;
}

/**
 * Get registry item by owner + name. If item is private, requestUserId must match owner.
 * Returns null if item not found or access denied (private + no auth / wrong user).
 */
export async function getRegistryItemByOwnerAndName(
  ownerId: string,
  name: string,
  requestUserId?: string | null
) {
  const [item] = await db
    .select()
    .from(registryItems)
    .where(
      and(
        eq(registryItems.userId, ownerId),
        eq(registryItems.name, name)
      ),
    )
    .orderBy(desc(registryItems.createdAt))
    .limit(1);

  if (!item || !isRegistryItemDirectlyResolvableStatus(item.status)) return null;

  // Private item: only owner can access
  if (item.visibility === "private") {
    if (!requestUserId || item.userId !== requestUserId) return null;
  }

  const files = await db
    .select()
    .from(registryFiles)
    .where(eq(registryFiles.itemId, item.id));

  return { ...item, files };
}

export async function getRegistryItemByOrganizationAndName(
  organizationId: string,
  name: string,
) {
  const [item] = await db
    .select()
    .from(registryItems)
    .where(
      and(
        eq(registryItems.organizationId, organizationId),
        eq(registryItems.name, name),
      ),
    )
    .orderBy(desc(registryItems.createdAt))
    .limit(1);

  if (!item || !isRegistryItemDirectlyResolvableStatus(item.status)) return null;

  const files = await db
    .select()
    .from(registryFiles)
    .where(eq(registryFiles.itemId, item.id));

  return { ...item, files };
}

async function getRegistryItemByOrganizationAndNameForViewer(
  organizationId: string,
  name: string,
  requestUserId?: string | null,
) {
  const item = await getRegistryItemByOrganizationAndName(organizationId, name);
  if (!item) return null;
  if (item.visibility === "private") {
    if (!requestUserId) return null;
    if (!(await isUserOrganizationMember(requestUserId, organizationId))) return null;
  }
  return item;
}

export async function getRegistryProjectByOwnerAndNamespace(
  ownerId: string,
  namespaceKey: string,
  requestUserId?: string | null,
) {
  const teamPath = parseTeamOwnerPath(ownerId);
  if (teamPath) {
    const organizationId = await resolveOrganizationIdFromLegacyOwnerPath(
      teamPath.orgSlug,
      teamPath.teamSegment,
    );
    if (!organizationId) return null;
    const [project] = await db
      .select()
      .from(registryProjects)
      .where(
        and(
          eq(registryProjects.organizationId, organizationId),
          eq(registryProjects.namespaceKey, namespaceKey),
        ),
      )
      .limit(1);
    return project ?? null;
  }

  const resolved = await resolveOwner(ownerId);
  if (resolved) {
    const [project] = await db
      .select()
      .from(registryProjects)
      .where(
        and(
          eq(registryProjects.ownerUserId, resolved.userId),
          eq(registryProjects.namespaceKey, namespaceKey),
        ),
      )
      .limit(1);
    return project ?? null;
  }

  const org = await resolveOrganizationBySlug(ownerId);
  if (!org) return null;
  if (requestUserId == null) {
    const [project] = await db
      .select()
      .from(registryProjects)
      .where(
        and(
          eq(registryProjects.organizationId, org.id),
          eq(registryProjects.namespaceKey, namespaceKey),
        ),
      )
      .limit(1);
    return project ?? null;
  }
  const canSeePrivate = await isUserOrganizationMember(requestUserId, org.id);
  const [project] = await db
    .select()
    .from(registryProjects)
    .where(
      and(
        eq(registryProjects.organizationId, org.id),
        eq(registryProjects.namespaceKey, namespaceKey),
        canSeePrivate
          ? sql`true`
          : eq(registryProjects.visibility, "public"),
      ),
    )
    .limit(1);
  return project ?? null;
}

export async function getRegistryItemByOwnerProjectName(
  ownerId: string,
  projectKey: string,
  name: string,
  version?: string | null,
  requestUserId?: string | null,
) {
  const project = await getRegistryProjectByOwnerAndNamespace(
    ownerId,
    projectKey,
    requestUserId,
  );
  if (!project) return null;

  let [item] = await db
    .select()
    .from(registryItems)
    .where(
      and(
        eq(registryItems.name, name),
        eq(registryItems.canonicalProjectId, project.id),
      ),
    )
    .orderBy(desc(registryItems.createdAt))
    .limit(1);

  // Transitional fallback for items that are still attached to a project via
  // registry_project_items but have not yet been rewritten to canonicalProjectId.
  if (!item) {
    const [linked] = await db
      .select({ itemId: registryItems.id })
      .from(registryProjectItems)
      .innerJoin(registryItems, eq(registryProjectItems.itemId, registryItems.id))
      .where(
        and(
          eq(registryProjectItems.projectId, project.id),
          eq(registryItems.name, name),
        ),
      )
      .orderBy(desc(registryItems.createdAt))
      .limit(1);

    if (linked) {
      [item] = await db
        .select()
        .from(registryItems)
        .where(eq(registryItems.id, linked.itemId))
        .limit(1);
    }
  }

  if (!item || !isRegistryItemDirectlyResolvableStatus(item.status)) return null;
  if (item.visibility === "private") {
    if (item.userId) {
      if (!requestUserId || item.userId !== requestUserId) return null;
    } else if (item.organizationId) {
      if (!requestUserId) return null;
      if (!(await isUserOrganizationMember(requestUserId, item.organizationId))) {
        return null;
      }
    }
  }

  const files = await db
    .select()
    .from(registryFiles)
    .where(eq(registryFiles.itemId, item.id));
  const base = { ...item, files };
  const currentVer = getCurrentVersion(base);
  if (!version || version === currentVer) {
    return base;
  }
  return loadRegistryItemVersionSnapshot(base, version);
}

/**
 * Whether a registry item exists for dependency resolution and whether the caller may read it.
 */
export async function getRegistryDependencyAccessForRef(
  ownerHandle: string,
  itemName: string,
  requestUserId?: string | null,
): Promise<"not_found" | "denied" | "ok"> {
  const teamPath = parseTeamOwnerPath(ownerHandle);
  if (teamPath) {
    const organizationId = await resolveOrganizationIdFromLegacyOwnerPath(
      teamPath.orgSlug,
      teamPath.teamSegment,
    );
    if (!organizationId) return "not_found";
    const item = await getRegistryItemByOrganizationAndName(organizationId, itemName);
    if (!item) return "not_found";
    if (!isRegistryItemDirectlyResolvableStatus(item.status)) return "not_found";
    if (item.visibility === "private") {
      if (!requestUserId) return "denied";
      if (!(await isUserOrganizationMember(requestUserId, organizationId))) return "denied";
    }
    return "ok";
  }

  const resolved = await resolveOwner(ownerHandle);
  if (resolved) {
    const [row] = await db
      .select({
        userId: registryItems.userId,
        visibility: registryItems.visibility,
        status: registryItems.status,
      })
      .from(registryItems)
      .where(
        and(
          eq(registryItems.userId, resolved.userId),
          eq(registryItems.name, itemName),
        ),
      )
      .limit(1);
    if (!row || !row.userId || !isRegistryItemDirectlyResolvableStatus(row.status)) {
      return "not_found";
    }
    if (row.visibility === "private" && row.userId !== requestUserId) return "denied";
    return "ok";
  }

  // Org-scoped registry: owner segment is organization slug (same as getRegistryItemByOwnerNameAndVersion).
  const orgOnly = await resolveOrganizationBySlug(ownerHandle);
  if (orgOnly) {
    const item = await getRegistryItemByOrganizationAndName(orgOnly.id, itemName);
    if (!item) return "not_found";
    if (!isRegistryItemDirectlyResolvableStatus(item.status)) return "not_found";
    if (item.visibility === "private") {
      if (!requestUserId) return "denied";
      if (!(await isUserOrganizationMember(requestUserId, orgOnly.id))) return "denied";
    }
    return "ok";
  }

  return "not_found";
}

export async function getRegistryDependencyAccessForScopedRef(params: {
  ownerHandle: string;
  projectKey?: string | null;
  itemName: string;
  requestUserId?: string | null;
}): Promise<"not_found" | "denied" | "ok"> {
  const projectKey = params.projectKey?.trim() ?? "";
  if (!projectKey) {
    return getRegistryDependencyAccessForRef(
      params.ownerHandle,
      params.itemName,
      params.requestUserId,
    );
  }

  const project = await getRegistryProjectByOwnerAndNamespace(
    params.ownerHandle,
    projectKey,
    params.requestUserId,
  );
  if (!project) return "not_found";

  const [item] = await db
    .select({
      userId: registryItems.userId,
      organizationId: registryItems.organizationId,
      visibility: registryItems.visibility,
      status: registryItems.status,
    })
    .from(registryItems)
    .where(
      and(
        eq(registryItems.name, params.itemName),
        eq(registryItems.canonicalProjectId, project.id),
      ),
    )
    .orderBy(desc(registryItems.createdAt))
    .limit(1);

  if (!item || !isRegistryItemDirectlyResolvableStatus(item.status)) {
    return "not_found";
  }
  if (item.visibility === "private") {
    if (item.userId) {
      if (!params.requestUserId || item.userId !== params.requestUserId) return "denied";
    } else if (item.organizationId) {
      if (!params.requestUserId) return "denied";
      if (!(await isUserOrganizationMember(params.requestUserId, item.organizationId))) {
        return "denied";
      }
    }
  }

  return "ok";
}

export type RegistryItemReferrer = {
  ownerHandle: string;
  itemName: string;
};

/**
 * Other registry items (snapshot or any historical version) whose registryDependencies reference @ownerHandle/itemName.
 */
export async function findRegistryItemsReferencing(
  ownerHandle: string,
  itemName: string,
  exclude?: { itemId?: string; ownerUserId?: string; itemName: string },
  projectKey?: string | null,
): Promise<RegistryItemReferrer[]> {
  const scopedPrefix = projectKey ? `@${ownerHandle}/${projectKey}/${itemName}` : `@${ownerHandle}/${itemName}`;
  const refExact = scopedPrefix;
  const versionPrefix = `${scopedPrefix}@`;

  const depMatchSnapshot = sql`
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(${registryItems.registryDependencies}, '[]'::jsonb)) AS t(dep)
      WHERE t.dep = ${refExact}
         OR t.dep LIKE ${versionPrefix + "%"}
    )
  `;

  const excludeCond =
    exclude?.itemId != null
      ? sql`NOT (${registryItems.id} = ${exclude.itemId})`
      : exclude != null
      ? sql`NOT (${registryItems.userId} = ${exclude.ownerUserId} AND ${registryItems.name} = ${exclude.itemName})`
      : sql`true`;

  const snapRows = await db
    .select({ userId: registryItems.userId, name: registryItems.name })
    .from(registryItems)
    .where(and(depMatchSnapshot, excludeCond));

  const depMatchVersion = sql`
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(${registryItemVersions.registryDependencies}, '[]'::jsonb)) AS t(dep)
      WHERE t.dep = ${refExact}
         OR t.dep LIKE ${versionPrefix + "%"}
    )
  `;

  const verRows = await db
    .select({ userId: registryItems.userId, name: registryItems.name })
    .from(registryItemVersions)
    .innerJoin(registryItems, eq(registryItemVersions.itemId, registryItems.id))
    .where(and(depMatchVersion, excludeCond));

  const seen = new Set<string>();
  const out: RegistryItemReferrer[] = [];

  const add = async (userId: string | null, name: string) => {
    if (!userId) return;
    const k = `${userId}\0${name}`;
    if (seen.has(k)) return;
    seen.add(k);
    const handle = (await resolveOwner(userId))?.handle ?? userId;
    out.push({ ownerHandle: handle, itemName: name });
  };

  for (const r of snapRows) {
    await add(r.userId, r.name);
  }
  for (const r of verRows) {
    await add(r.userId, r.name);
  }

  return out;
}

/** 当前展示版本号（兼容旧数据无 currentVersion） */
export function getCurrentVersion(item: { currentVersion?: string | null }): string {
  return item.currentVersion ?? INITIAL_VERSION;
}

/**
 * 从 theme 条目中取入口样式内容（STYLE_AND_THEME_SPEC §4.2）。
 * 顺序：meta.entryPath 指定文件 → 首个 .css 文件 → 首个文件。
 */
export function getThemeEntryCss(item: {
  files: { path: string; content: string }[];
  meta?: Record<string, unknown> | null;
}): string {
  const files = item.files ?? [];
  if (files.length === 0) return "";

  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const entryPath = meta.entryPath as string | undefined;
  if (entryPath && typeof entryPath === "string") {
    const f = files.find((x) => x.path === entryPath || x.path.endsWith(entryPath));
    if (f) return stripCozyHeader(f.content);
  }

  const firstCss = files.find((f) => f.path.toLowerCase().endsWith(".css"));
  if (firstCss) return stripCozyHeader(firstCss.content);
  return stripCozyHeader(files[0].content);
}

function stripCozyHeader(content: string): string {
  if (content.startsWith("// cozy-registry:")) {
    const i = content.indexOf("\n");
    return i >= 0 ? content.slice(i + 1).trimStart() : "";
  }
  if (content.startsWith("/* cozy-registry:")) {
    const end = content.indexOf("*/");
    return end >= 0 ? content.slice(end + 2).trimStart() : content;
  }
  return content;
}

function rewriteRegistryFileForOwner(params: {
  ownerId: string;
  itemName: string;
  version: string;
  path: string;
  content: string;
  type: string;
}) {
  const normalizedType = normalizeRegistryItemType(params.type);
  const isCss =
    normalizedType === REGISTRY_THEME_TYPE || params.path.toLowerCase().endsWith(".css");
  return withCozyHeader({
    ownerId: params.ownerId,
    name: params.itemName,
    version: params.version,
    content: stripCozyHeader(params.content),
    format: isCss ? "css" : "js",
  });
}

async function loadRegistryItemVersionSnapshot<
  T extends { id: string; files: unknown[] },
>(base: T, version: string) {
  const [itemVersion] = await db
    .select()
    .from(registryItemVersions)
    .where(
      and(eq(registryItemVersions.itemId, base.id), eq(registryItemVersions.version, version)),
    );

  if (!itemVersion) return null;

  const fileVersions = await db
    .select()
    .from(registryFileVersions)
    .where(eq(registryFileVersions.itemVersionId, itemVersion.id));

  return {
    ...base,
    title: itemVersion.title,
    description: itemVersion.description,
    dependencies: itemVersion.dependencies,
    registryDependencies: itemVersion.registryDependencies,
    meta: itemVersion.meta ?? (base as { meta?: unknown }).meta,
    files: fileVersions.map((f) => ({
      path: f.path,
      content: f.content,
      type: f.type,
    })),
  };
}

/**
 * 按 owner/name 获取组件，可选指定版本。不传 version 或等于当前版本时返回最新快照。
 * owner 可为 user handle / id，或团队路径 `orgSlug/teamSlug`（teamSlug 为 slugify(team.name)）。
 */
export async function getRegistryItemByOwnerNameAndVersion(
  ownerId: string,
  name: string,
  version: string | null | undefined,
  requestUserId?: string | null,
) {
  const teamPath = parseTeamOwnerPath(ownerId);
  if (teamPath) {
    const organizationId = await resolveOrganizationIdFromLegacyOwnerPath(
      teamPath.orgSlug,
      teamPath.teamSegment,
    );
    if (!organizationId) return null;
    const base = await getRegistryItemByOrganizationAndNameForViewer(
      organizationId,
      name,
      requestUserId,
    );
    if (!base) return null;

    const currentVer = getCurrentVersion(base);
    if (!version || version === currentVer) return base;

    return loadRegistryItemVersionSnapshot(base, version);
  }

  const resolved = await resolveOwner(ownerId);
  if (resolved) {
    const base = await getRegistryItemByOwnerAndName(resolved.userId, name, requestUserId);
    if (!base) return null;
    const currentVer = getCurrentVersion(base);
    if (!version || version === currentVer) return base;
    return loadRegistryItemVersionSnapshot(base, version);
  }

  const orgOnly = await resolveOrganizationBySlug(ownerId);
  if (orgOnly) {
    const base = await getRegistryItemByOrganizationAndNameForViewer(
      orgOnly.id,
      name,
      requestUserId,
    );
    if (!base) return null;
    const currentVer = getCurrentVersion(base);
    if (!version || version === currentVer) return base;
    return loadRegistryItemVersionSnapshot(base, version);
  }

  return null;
}

export async function getRegistryItemByScopedIdentityAndVersion(params: {
  ownerId: string;
  projectKey?: string | null;
  name: string;
  version: string | null | undefined;
  requestUserId?: string | null;
}) {
  const projectKey = params.projectKey?.trim() ?? "";
  if (projectKey) {
    return getRegistryItemByOwnerProjectName(
      params.ownerId,
      projectKey,
      params.name,
      params.version,
      params.requestUserId,
    );
  }

  return getRegistryItemByOwnerNameAndVersion(
    params.ownerId,
    params.name,
    params.version,
    params.requestUserId,
  );
}

export async function getRegistryItemByOwnerNameAndVersionScoped(
  scope: RegistryScope & {
    ownerId: string;
    name: string;
    version: string | null | undefined;
  },
) {
  const item = await getRegistryItemByOwnerNameAndVersion(
    scope.ownerId,
    scope.name,
    scope.version,
    scope.requestUserId,
  );
  if (!item) return null;

  const policy = scope.policy;
  if (!policy) return item;

  const allowedTypes = (policy.allowedTypes ?? []).filter(Boolean);
  if (allowedTypes.length > 0 && !allowedTypes.includes(item.type)) return null;

  const allowedOwners = (policy.allowedOwnerHandlesOrIds ?? []).filter(Boolean);
  if (allowedOwners.length > 0) {
    const ownerHandle =
      item.userId != null
        ? ((await resolveOwner(item.userId))?.handle ?? null)
        : null;
    const orgRef =
      item.organizationId != null
        ? await getOrganizationCanonicalOwnerRef(item.organizationId)
        : null;
    const matches =
      (item.userId != null && allowedOwners.includes(item.userId)) ||
      (ownerHandle != null && allowedOwners.includes(ownerHandle)) ||
      (item.organizationId != null &&
        policy.ownerOrganizationId != null &&
        item.organizationId === policy.ownerOrganizationId) ||
      (orgRef != null && allowedOwners.includes(orgRef));
    if (!matches) return null;
  }

  const allowedProjectIds = policy.allowedProjectIds ?? [];
  const allowPublicOutsideProjects = !!policy.allowPublicOutsideProjects;
  if (allowedProjectIds.length === 0) {
    if (!allowPublicOutsideProjects) return null;
    if (item.visibility !== "public") return null;
    return item;
  }

  // If public outside projects is allowed, only require membership for non-public.
  if (allowPublicOutsideProjects && item.visibility === "public") {
    return item;
  }

  const [membership] = await db
    .select({ itemId: registryProjectItems.itemId })
    .from(registryProjectItems)
    .where(
      and(
        eq(registryProjectItems.itemId, item.id),
        inArray(registryProjectItems.projectId, allowedProjectIds),
      ),
    )
    .limit(1);

  return membership ? item : null;
}

/** Version rows for an item already loaded (avoids re-resolving owner/project/name in preview hot paths). */
export async function getRegistryItemVersionsByItemId(itemId: string): Promise<
  { version: string; createdAt: Date; createdBy: string | null; message?: string | null }[]
> {
  const versions = await db
    .select({
      version: registryItemVersions.version,
      createdAt: registryItemVersions.createdAt,
      createdBy: registryItemVersions.createdBy,
      meta: registryItemVersions.meta,
    })
    .from(registryItemVersions)
    .where(eq(registryItemVersions.itemId, itemId))
    .orderBy(desc(registryItemVersions.createdAt));

  return versions.map((v) => {
    const meta = (v as { meta?: unknown }).meta as
      | Record<string, unknown>
      | null
      | undefined;
    const message =
      meta && typeof meta === "object" && typeof meta.message === "string"
        ? meta.message
        : null;
    return {
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      message,
    };
  });
}

/**
 * 获取组件的版本列表（用于版本选择器 / 升级提示）
 * ownerId 可为 user handle / id，或团队路径 `orgSlug/teamSlug`。
 */
export async function getRegistryItemVersions(
  ownerId: string,
  name: string,
  requestUserId?: string | null,
): Promise<
  { version: string; createdAt: Date; createdBy: string | null; message?: string | null }[]
> {
  const teamPath = parseTeamOwnerPath(ownerId);
  if (teamPath) {
    const organizationId = await resolveOrganizationIdFromLegacyOwnerPath(
      teamPath.orgSlug,
      teamPath.teamSegment,
    );
    if (!organizationId) return [];
    const item = await getRegistryItemByOrganizationAndNameForViewer(
      organizationId,
      name,
      requestUserId,
    );
    if (!item) return [];
    return getRegistryItemVersionsByItemId(item.id);
  }

  const resolved = await resolveOwner(ownerId);
  if (resolved) {
    const item = await getRegistryItemByOwnerAndName(resolved.userId, name, requestUserId);
    if (!item) return [];
    return getRegistryItemVersionsByItemId(item.id);
  }

  const org = await resolveOrganizationBySlug(ownerId);
  if (org) {
    const item = await getRegistryItemByOrganizationAndNameForViewer(
      org.id,
      name,
      requestUserId,
    );
    if (!item) return [];
    return getRegistryItemVersionsByItemId(item.id);
  }

  return [];
}

export async function getRegistryItemVersionsScoped(params: {
  ownerId: string;
  projectKey?: string | null;
  name: string;
  requestUserId?: string | null;
}): Promise<
  { version: string; createdAt: Date; createdBy: string | null; message?: string | null }[]
> {
  const projectKey = params.projectKey?.trim() ?? "";
  if (!projectKey) {
    return getRegistryItemVersions(params.ownerId, params.name, params.requestUserId);
  }

  const item = await getRegistryItemByOwnerProjectName(
    params.ownerId,
    projectKey,
    params.name,
    null,
    params.requestUserId,
  );
  if (!item) return [];
  return getRegistryItemVersionsByItemId(item.id);
}

/**
 * 发布新版本（Vibe 更新已有组件时调用）。仅组件 owner 可调用。
 */
export async function createRegistryItemVersion(params: {
  ownerId?: string;
  organizationId?: string;
  canonicalProjectId?: string | null;
  canonicalProjectKey?: string | null;
  name: string;
  /**
   * 单文件入口内容（向后兼容）。当提供 files 时会被忽略。
   */
  content?: string;
  /**
   * 多文件 bundle。key 为相对路径。若为空则退回到单文件 content。
   */
  files?: Record<string, string>;
  bump: "patch" | "minor" | "major";
  userId: string;
  message?: string;
  dependencies?: string[];
  declaredDependencies?: Array<{ name: string; version: string | null }>;
  dependencyDecisions?: unknown;
  registryDependencies?: string[];
  /** 可选：更新用于预览的 props（将写回 registry_items.meta.previewProps） */
  previewProps?: unknown;
  /** 可选：强制预览使用的命名导出（将写回 meta.previewExport） */
  previewExport?: string | null;
  /** 可选：storybook-like previews stored in meta.previewStories */
  previewStories?: unknown;
  /** 可选：default story id in meta.previewDefaultStoryId */
  previewDefaultStoryId?: string | null;
}) {
  const ownerRefForScopedLookup =
    params.organizationId != null
      ? (await getOrganizationCanonicalOwnerRef(params.organizationId)) ?? params.organizationId
      : params.ownerId != null
        ? (await resolveOwner(params.ownerId))?.handle ?? params.ownerId
        : null;
  const item =
    params.canonicalProjectKey && ownerRefForScopedLookup
      ? await getRegistryItemByOwnerProjectName(
          ownerRefForScopedLookup,
          params.canonicalProjectKey,
          params.name,
          null,
          params.userId,
        )
      : params.organizationId
        ? await getRegistryItemByOrganizationAndName(params.organizationId, params.name)
        : params.ownerId
          ? await getRegistryItemByOwnerAndName(
              params.ownerId,
              params.name,
              params.userId,
            )
          : null;
  if (!item) throw new Error("Item not found or no access");
  ensureRegistryItemMutable(item.status);
  if (params.organizationId) {
    if (item.organizationId !== params.organizationId) {
      throw new Error("Only the owning organization can publish a new version");
    }
    const writable = await getWritableOrganizationTargetForUser(
      params.userId,
      params.organizationId,
    );
    if (!writable) {
      throw new Error("Only organization editors can publish a new version");
    }
  } else if (item.userId !== params.userId) {
    throw new Error("Only owner can publish new version");
  }

  const currentVer = getCurrentVersion(item);
  const nextVersion = bumpVersion(currentVer, params.bump);
  const normalizedType = normalizeRegistryItemType(item.type);
  const nextDependencies =
    params.dependencies ?? ((item.dependencies ?? []) as string[]);
  const nextRegistryDependencies =
    params.registryDependencies ?? ((item.registryDependencies ?? []) as string[]);

  // 归一化为多文件 bundle：
  // - 若显式提供 files，则优先使用
  // - 否则仅更新一个入口文件（向后兼容）
  const normalizedFiles = (() => {
    const files = params.files && Object.keys(params.files).length > 0 ? params.files : null;
    if (files) return files;
    if (!params.content) {
      throw new Error("Either files or content must be provided when creating new version");
    }
    const entryPath = item.files[0]?.path ?? getDefaultRegistryEntryPath(normalizedType);
    return { [entryPath]: params.content };
  })();
  const ownerLabelForThumb =
    params.organizationId != null
      ? (await getOrganizationCanonicalOwnerRef(params.organizationId)) ??
        params.organizationId
      : (params.ownerId ?? "legacy");

  const thumbnail = await maybeBuildRegistryThumbnail({
    type: normalizedType,
    files: normalizedFiles,
    content: params.content,
    ownerId: ownerLabelForThumb,
    itemName: params.name,
    version: nextVersion,
  });

  const baseMeta =
    typeof item.meta === "object" && item.meta ? { ...item.meta } : {};
  delete (baseMeta as Record<string, unknown>).thumbnail;

  const filesForDb: {
    path: string;
    content: string;
    type: string;
  }[] = [];

  for (const [pathKey, rawContent] of Object.entries(normalizedFiles)) {
    const isCss =
      normalizedType === REGISTRY_THEME_TYPE ||
      pathKey.toLowerCase().endsWith(".css");
    const contentWithHeader = withCozyHeader({
      ownerId: ownerLabelForThumb,
      name: params.name,
      version: nextVersion,
      content: rawContent,
      format: isCss ? "css" : "js",
    });
    filesForDb.push({
      path: pathKey,
      content: contentWithHeader,
      type: item.type,
    });
  }
  const dependencySnapshot =
    params.declaredDependencies !== undefined || params.dependencyDecisions !== undefined
      ? buildDependencySnapshot({
          declared: params.declaredDependencies,
          decisions: Array.isArray(params.dependencyDecisions)
            ? params.dependencyDecisions
            : undefined,
        })
      : null;

  const [itemVersion] = await db
    .insert(registryItemVersions)
    .values({
      itemId: item.id,
      version: nextVersion,
      title: item.title,
      description: item.description,
      dependencies: nextDependencies,
      registryDependencies: nextRegistryDependencies,
      meta: ((): Record<string, unknown> => {
        const next: Record<string, unknown> = {
          ...baseMeta,
          message: params.message,
          source: "vibe",
        };
        if (params.declaredDependencies !== undefined) {
          next.declaredDependencies = params.declaredDependencies;
        }
        if (params.dependencyDecisions !== undefined) {
          next.dependencyDecisions = params.dependencyDecisions;
        }
        if (dependencySnapshot) {
          next.dependencySnapshot = dependencySnapshot;
        }
        if (params.previewProps !== undefined) {
          next.previewProps = params.previewProps;
        }
        if (params.previewExport !== undefined) {
          next.previewExport = params.previewExport;
        }
        if (params.previewStories !== undefined) {
          next.previewStories = params.previewStories;
        }
        if (params.previewDefaultStoryId !== undefined) {
          next.previewDefaultStoryId = params.previewDefaultStoryId;
        }
        if (thumbnail) {
          next.thumbnail = thumbnail;
        }
        return next;
      })(),
      createdBy: params.userId,
    })
    .returning();

  if (!itemVersion) throw new Error("Failed to create version record");

  await db.insert(registryFileVersions).values(
    filesForDb.map((f) => ({
      itemVersionId: itemVersion.id,
      path: f.path,
      content: f.content,
      type: f.type,
    })),
  );

  // 更新当前快照：先删后插，保持与版本表结构一致
  await db
    .delete(registryFiles)
    .where(eq(registryFiles.itemId, item.id));

  await db.insert(registryFiles).values(
    filesForDb.map((f) => ({
      itemId: item.id,
      path: f.path,
      content: f.content,
      type: f.type,
    })),
  );

  await db
    .update(registryItems)
    .set({
      dependencies: nextDependencies,
      currentVersion: nextVersion,
      registryDependencies: nextRegistryDependencies,
      ...(params.canonicalProjectId !== undefined
        ? {
            canonicalProjectId: params.canonicalProjectId,
            canonicalProjectKey: params.canonicalProjectKey ?? null,
          }
        : {}),
      updatedAt: new Date(),
      ...((params.previewProps !== undefined ||
        params.declaredDependencies !== undefined ||
        params.dependencyDecisions !== undefined ||
        params.previewExport !== undefined ||
        params.previewStories !== undefined ||
        params.previewDefaultStoryId !== undefined ||
        thumbnail)
        ? {
            meta: {
              ...baseMeta,
              ...(params.declaredDependencies !== undefined
                ? { declaredDependencies: params.declaredDependencies }
                : {}),
              ...(params.dependencyDecisions !== undefined
                ? { dependencyDecisions: params.dependencyDecisions }
                : {}),
              ...(dependencySnapshot ? { dependencySnapshot } : {}),
              ...(params.previewProps !== undefined
                ? { previewProps: params.previewProps }
                : {}),
              ...(params.previewExport !== undefined
                ? { previewExport: params.previewExport }
                : {}),
              ...(params.previewStories !== undefined
                ? { previewStories: params.previewStories }
                : {}),
              ...(params.previewDefaultStoryId !== undefined
                ? { previewDefaultStoryId: params.previewDefaultStoryId }
                : {}),
              ...(thumbnail ? { thumbnail } : {}),
            } as Record<string, unknown>,
          }
        : {}),
    })
    .where(eq(registryItems.id, item.id));

  await enqueueThumbnailJob({
    itemId: item.id,
    itemVersionId: itemVersion.id,
    payload: {
      ownerId: ownerLabelForThumb,
      ownerHandle: null,
      name: params.name,
      version: nextVersion,
      type: normalizedType,
    },
  });

  if (normalizedType !== REGISTRY_THEME_TYPE) {
    await enqueueWarmPreviewArtifacts({
      itemId: item.id,
      itemVersionId: itemVersion.id,
      owner: ownerLabelForThumb,
      project: item.canonicalProjectKey ?? null,
      name: params.name,
      version: nextVersion,
      requestUserId: params.userId,
      meta: itemVersion.meta,
    });
  }

  return { version: nextVersion, id: itemVersion.id };
}

/**
 * @deprecated Use getRegistryItemByOwnerAndName. For backward compat, looks up by name only.
 * If multiple items match (different owners), returns first public one or owner's if requestUserId matches.
 */
export async function getRegistryItemByName(
  name: string,
  requestUserId?: string | null
) {
  const items = await db
    .select()
    .from(registryItems)
    .where(eq(registryItems.name, name));

  if (items.length === 0) return null;
  if (items.length === 1) {
    const item = items[0];
    if (!isRegistryItemDirectlyResolvableStatus(item.status)) return null;
    if (item.visibility === "private" && (!requestUserId || item.userId !== requestUserId))
      return null;
    const files = await db
      .select()
      .from(registryFiles)
      .where(eq(registryFiles.itemId, item.id));
    return { ...item, files };
  }

  // Multiple: prefer owner's, then first public
  const ownerMatch = requestUserId ? items.find((i) => i.userId === requestUserId) : undefined;
  const publicMatch = items.find(
    (i) => i.visibility === "public" && isRegistryItemDirectlyResolvableStatus(i.status),
  );
  const pick =
    [ownerMatch, publicMatch, ...items].find(
      (item) => item && isRegistryItemDirectlyResolvableStatus(item.status),
    ) ?? null;
  if (!pick) return null;
  if (pick.visibility === "private" && (!requestUserId || pick.userId !== requestUserId))
    return null;
  const files = await db
    .select()
    .from(registryFiles)
    .where(eq(registryFiles.itemId, pick.id));
  return { ...pick, files };
}

export function toShadcnRegistryItem(
  item: {
    name: string;
    type: string;
    title: string;
    description: string | null;
    dependencies: string[] | null;
    registryDependencies: string[] | null;
    files: { path: string; content: string; type: string }[];
  } | null
) {
  if (!item) return null;

  const base = {
    name: item.name,
    type: normalizeRegistryItemType(item.type) as
      | typeof REGISTRY_BLOCK_TYPE
      | typeof REGISTRY_UI_TYPE
      | typeof REGISTRY_THEME_TYPE,
    title: item.title,
    description: item.description ?? undefined,
    dependencies: (item.dependencies ?? []) as string[],
    registryDependencies: (item.registryDependencies ?? []) as string[],
  };

  const files = item.files.map((f) => ({
    path: f.path,
    content: f.content,
    type: normalizeRegistryItemType(f.type) as
      | typeof REGISTRY_BLOCK_TYPE
      | typeof REGISTRY_UI_TYPE
      | typeof REGISTRY_THEME_TYPE,
  }));

  return { ...base, files };
}

/**
 * Get registry items owned by a specific user (for dashboard).
 */
export async function getRegistryItemsByUserId(userId: string) {
  const items = await db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      canonicalProjectKey: registryItems.canonicalProjectKey,
      ownerHandle: user.handle,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      status: registryItems.status,
      archivedAt: registryItems.archivedAt,
      deletedAt: registryItems.deletedAt,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id))
    .where(eq(registryItems.userId, userId))
    .orderBy(registryItems.name);

  return items;
}

/**
 * Get registry items owned by a specific organization (org workspace).
 */
export async function getRegistryItemsByOrganizationId(organizationId: string) {
  const items = await db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      organizationId: registryItems.organizationId,
      canonicalProjectKey: registryItems.canonicalProjectKey,
      ownerHandle: user.handle,
      organizationName: organization.name,
      orgSlug: organization.slug,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      status: registryItems.status,
      archivedAt: registryItems.archivedAt,
      deletedAt: registryItems.deletedAt,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id))
    .innerJoin(organization, eq(registryItems.organizationId, organization.id))
    .where(eq(registryItems.organizationId, organizationId))
    .orderBy(registryItems.name);

  return items;
}

/**
 * List organization-owned items for MCP / catalog: public, or private when caller is an org member.
 */
export async function getRegistryItemsForOrganization(
  organizationId: string,
  requestUserId: string | null,
  pagination?: { limit?: number; offset?: number } | null,
) {
  const canSeePrivate =
    requestUserId != null && (await isUserOrganizationMember(requestUserId, organizationId));

  const visibilityClause = canSeePrivate
    ? eq(registryItems.organizationId, organizationId)
    : and(
        eq(registryItems.organizationId, organizationId),
        eq(registryItems.visibility, "public"),
      );

  const base = db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      organizationId: registryItems.organizationId,
      canonicalProjectKey: registryItems.canonicalProjectKey,
      ownerHandle: user.handle,
      orgSlug: organization.slug,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      status: registryItems.status,
      archivedAt: registryItems.archivedAt,
      deletedAt: registryItems.deletedAt,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id))
    .innerJoin(organization, eq(registryItems.organizationId, organization.id))
    .where(and(visibilityClause, eq(registryItems.status, ACTIVE_REGISTRY_ITEM_STATUS)))
    .orderBy(registryItems.name);

  if (pagination?.limit != null) {
    if (pagination.offset != null && pagination.offset > 0) {
      return base.limit(pagination.limit).offset(pagination.offset);
    }
    return base.limit(pagination.limit);
  }
  if (pagination?.offset != null && pagination.offset > 0) {
    return base.offset(pagination.offset);
  }
  return base;
}

export async function createRegistryItem(data: {
  name: string;
  type: string;
  title: string;
  description?: string | null;
  canonicalProjectId?: string | null;
  canonicalProjectKey?: string | null;
  /**
   * 单文件入口内容（向后兼容）。当提供 files 时会被忽略；
   * 当 files 为空时，会被包装为一个默认文件。
   */
  content?: string;
  /**
   * 多文件 bundle。key 为相对路径，例如：
   * - "index.tsx"
   * - "Button.tsx"
   * - "hooks/useFoo.ts"
   * - "styles.css"
   */
  files?: Record<string, string>;
  userId?: string | null;
  organizationId?: string | null;
  visibility?: "public" | "private";
  dependencies?: string[];
  declaredDependencies?: Array<{ name: string; version: string | null }>;
  dependencyDecisions?: unknown;
  registryDependencies?: string[];
  /** 用于预览的 props 对象（会存入 registry_items.meta.previewProps） */
  previewProps?: unknown;
  /** 可选：强制预览使用的命名导出（meta.previewExport） */
  previewExport?: string | null;
  /** 可选：story list（meta.previewStories） */
  previewStories?: unknown;
  /** 可选：default story id（meta.previewDefaultStoryId） */
  previewDefaultStoryId?: string | null;
  /** 用于预热 preview artifact 的访问身份。组织私有资源需要它才能被 worker 读取。 */
  requestUserId?: string | null;
}) {
  if (!!data.userId === !!data.organizationId) {
    throw new Error("Registry items must belong to exactly one owner scope");
  }
  const normalizedType = normalizeRegistryItemType(data.type);
  const normalizedFiles = (() => {
    const files = data.files && Object.keys(data.files).length > 0 ? data.files : null;
    if (files) return files;
    if (!data.content) {
      throw new Error("Either files or content must be provided when creating registry item");
    }
    const singlePath = getDefaultRegistryEntryPath(normalizedType);
    return { [singlePath]: data.content };
  })();
  const thumbOwner =
    data.organizationId != null
      ? (await getOrganizationCanonicalOwnerRef(data.organizationId)) ?? data.organizationId
      : (data.userId ?? "legacy");

  const thumbnail = await maybeBuildRegistryThumbnail({
    type: normalizedType,
    files: normalizedFiles,
    content: data.content,
    ownerId: thumbOwner,
    itemName: data.name,
    version: INITIAL_VERSION,
  });
  const dependencySnapshot =
    data.declaredDependencies !== undefined || data.dependencyDecisions !== undefined
      ? buildDependencySnapshot({
          declared: data.declaredDependencies,
          decisions: Array.isArray(data.dependencyDecisions)
            ? data.dependencyDecisions
            : undefined,
        })
      : null;
  const [item] = await db
    .insert(registryItems)
    .values({
      name: data.name,
      type: normalizedType,
      title: data.title,
      description: data.description ?? null,
      userId: data.userId ?? null,
      organizationId: data.organizationId ?? null,
      canonicalProjectId: data.canonicalProjectId ?? null,
      canonicalProjectKey: data.canonicalProjectKey ?? null,
      visibility: data.visibility ?? "public",
      status: ACTIVE_REGISTRY_ITEM_STATUS,
      dependencies: data.dependencies ?? [],
      registryDependencies: data.registryDependencies ?? [],
      meta: {
        ...(data.declaredDependencies !== undefined
          ? { declaredDependencies: data.declaredDependencies }
          : {}),
        ...(data.dependencyDecisions !== undefined
          ? { dependencyDecisions: data.dependencyDecisions }
          : {}),
        ...(dependencySnapshot ? { dependencySnapshot } : {}),
        ...(data.previewProps !== undefined ? { previewProps: data.previewProps } : {}),
        ...(data.previewExport !== undefined
          ? { previewExport: data.previewExport }
          : {}),
        ...(data.previewStories !== undefined
          ? { previewStories: data.previewStories }
          : {}),
        ...(data.previewDefaultStoryId !== undefined
          ? { previewDefaultStoryId: data.previewDefaultStoryId }
          : {}),
        ...(thumbnail ? { thumbnail } : {}),
      },
      currentVersion: INITIAL_VERSION,
    })
    .returning();

  if (!item) throw new Error("Failed to create registry item");

  const filesForDb: {
    path: string;
    content: string;
    type: string;
  }[] = [];

  for (const [pathKey, rawContent] of Object.entries(normalizedFiles)) {
    const isCss =
      normalizedType === REGISTRY_THEME_TYPE ||
      pathKey.toLowerCase().endsWith(".css");
    const contentWithHeader = withCozyHeader({
      ownerId: thumbOwner,
      name: data.name,
      version: INITIAL_VERSION,
      content: rawContent,
      format: isCss ? "css" : "js",
    });
    filesForDb.push({
      path: pathKey,
      content: contentWithHeader,
      type: normalizedType,
    });
  }

  await db.insert(registryFiles).values(
    filesForDb.map((f) => ({
      itemId: item.id,
      path: f.path,
      content: f.content,
      type: f.type,
    })),
  );

  const [itemVersion] = await db
    .insert(registryItemVersions)
    .values({
      itemId: item.id,
      version: INITIAL_VERSION,
      title: data.title,
      description: data.description ?? null,
      dependencies: data.dependencies ?? [],
      registryDependencies: data.registryDependencies ?? [],
      meta: {
        source: "initial",
        ...(data.declaredDependencies !== undefined
          ? { declaredDependencies: data.declaredDependencies }
          : {}),
        ...(data.dependencyDecisions !== undefined
          ? { dependencyDecisions: data.dependencyDecisions }
          : {}),
        ...(dependencySnapshot ? { dependencySnapshot } : {}),
        ...(data.previewProps !== undefined ? { previewProps: data.previewProps } : {}),
        ...(data.previewExport !== undefined
          ? { previewExport: data.previewExport }
          : {}),
        ...(data.previewStories !== undefined
          ? { previewStories: data.previewStories }
          : {}),
        ...(data.previewDefaultStoryId !== undefined
          ? { previewDefaultStoryId: data.previewDefaultStoryId }
          : {}),
        ...(thumbnail ? { thumbnail } : {}),
      },
      createdBy: data.userId ?? null,
    })
    .returning();

  if (itemVersion) {
    await db.insert(registryFileVersions).values(
      filesForDb.map((f) => ({
        itemVersionId: itemVersion.id,
        path: f.path,
        content: f.content,
        type: f.type,
      })),
    );

    await enqueueThumbnailJob({
      itemId: item.id,
      itemVersionId: itemVersion.id,
      payload: {
        ownerId: thumbOwner,
        ownerHandle: null,
        name: data.name,
        version: INITIAL_VERSION,
        type: normalizedType,
      },
    });

    if (normalizedType !== REGISTRY_THEME_TYPE) {
      await enqueueWarmPreviewArtifacts({
        itemId: item.id,
        itemVersionId: itemVersion.id,
        owner: thumbOwner,
        project: item.canonicalProjectKey ?? null,
        name: data.name,
        version: INITIAL_VERSION,
        requestUserId: data.requestUserId ?? data.userId ?? null,
        meta: itemVersion.meta ?? item.meta,
      });
    }
  }

  return {
    ...item,
    initialVersionId: itemVersion?.id ?? null,
  };
}

/**
 * 默认删除语义是 archive-first：从 browse/search 隐藏，但保留 direct resolution、
 * 历史版本与 preview 所需的数据面。
 */
export async function archiveRegistryItem(params: {
  ownerId: string;
  ownerRef?: string;
  projectKey?: string | null;
  name: string;
  requestUserId: string;
  lifecycleReason?: string | null;
}) {
  const item =
    params.projectKey && params.ownerRef
      ? await getRegistryItemByOwnerProjectName(
          params.ownerRef,
          params.projectKey,
          params.name,
          null,
          params.requestUserId,
        )
      : await getRegistryItemByOwnerAndName(
          params.ownerId,
          params.name,
          params.requestUserId,
        );
  if (!item) {
    throw new Error("Item not found or no access");
  }
  if (item.userId !== params.requestUserId) {
    throw new Error("Only owner can archive the component");
  }
  if (item.status === ARCHIVED_REGISTRY_ITEM_STATUS) return item;
  if (item.status === DELETED_REGISTRY_ITEM_STATUS) {
    throw new Error("Deleted items cannot be archived");
  }

  const [updated] = await db
    .update(registryItems)
    .set({
      status: ARCHIVED_REGISTRY_ITEM_STATUS,
      archivedAt: new Date(),
      archivedBy: params.requestUserId,
      lifecycleReason: params.lifecycleReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(registryItems.id, item.id))
    .returning();

  if (!updated) throw new Error("Failed to archive registry item");
  return updated;
}

export async function archiveOrganizationRegistryItem(params: {
  organizationId: string;
  ownerRef?: string;
  projectKey?: string | null;
  name: string;
  requestUserId: string;
  lifecycleReason?: string | null;
}) {
  const item =
    params.projectKey && params.ownerRef
      ? await getRegistryItemByOwnerProjectName(
          params.ownerRef,
          params.projectKey,
          params.name,
          null,
          params.requestUserId,
        )
      : await getRegistryItemByOrganizationAndName(params.organizationId, params.name);
  if (!item) {
    throw new Error("Item not found or no access");
  }
  const writable = await getWritableOrganizationTargetForUser(
    params.requestUserId,
    params.organizationId,
  );
  if (!writable) {
    throw new Error("Only owner or editor can archive the component");
  }
  if (item.status === ARCHIVED_REGISTRY_ITEM_STATUS) return item;
  if (item.status === DELETED_REGISTRY_ITEM_STATUS) {
    throw new Error("Deleted items cannot be archived");
  }

  const [updated] = await db
    .update(registryItems)
    .set({
      status: ARCHIVED_REGISTRY_ITEM_STATUS,
      archivedAt: new Date(),
      archivedBy: params.requestUserId,
      lifecycleReason: params.lifecycleReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(registryItems.id, item.id))
    .returning();

  if (!updated) throw new Error("Failed to archive registry item");
  return updated;
}

export async function permanentlyDeleteRegistryItem(params: {
  ownerId: string;
  name: string;
  requestUserId: string;
  ownerRef?: string;
  projectKey?: string | null;
  lifecycleReason?: string | null;
}) {
  const item =
    params.projectKey && params.ownerRef
      ? await getRegistryItemByOwnerProjectName(
          params.ownerRef,
          params.projectKey,
          params.name,
          null,
          params.requestUserId,
        )
      : await getRegistryItemByOwnerAndName(
          params.ownerId,
          params.name,
          params.requestUserId,
        );
  if (!item) {
    throw new Error("Item not found or no access");
  }
  if (item.userId !== params.requestUserId) {
    throw new Error("Only owner can permanently delete the component");
  }
  if (item.status !== ARCHIVED_REGISTRY_ITEM_STATUS) {
    throw new Error("Permanent delete requires the item to be archived first");
  }

  if (params.ownerRef) {
    const referrers = await findRegistryItemsReferencing(
      params.ownerRef,
      params.name,
      { itemId: item.id, ownerUserId: params.ownerId, itemName: params.name },
      params.projectKey ?? null,
    );
    if (referrers.length > 0) {
      const list = referrers
        .slice(0, 20)
        .map((r) => `@${r.ownerHandle}/${r.itemName}`)
        .join(", ");
      throw new Error(
        `Cannot delete: still referenced in registryDependencies by: ${list}${referrers.length > 20 ? " …" : ""}`,
      );
    }
  }

  const [marked] = await db
    .update(registryItems)
    .set({
      status: DELETED_REGISTRY_ITEM_STATUS,
      deletedAt: new Date(),
      deletedBy: params.requestUserId,
      lifecycleReason: params.lifecycleReason ?? item.lifecycleReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(registryItems.id, item.id))
    .returning({ id: registryItems.id });
  if (!marked) throw new Error("Failed to mark registry item deleted");

  await db.delete(registryItems).where(eq(registryItems.id, item.id));
}

export async function permanentlyDeleteOrganizationRegistryItem(params: {
  organizationId: string;
  name: string;
  requestUserId: string;
  ownerRef?: string;
  projectKey?: string | null;
  lifecycleReason?: string | null;
}) {
  const item =
    params.projectKey && params.ownerRef
      ? await getRegistryItemByOwnerProjectName(
          params.ownerRef,
          params.projectKey,
          params.name,
          null,
          params.requestUserId,
        )
      : await getRegistryItemByOrganizationAndName(params.organizationId, params.name);
  if (!item) {
    throw new Error("Item not found or no access");
  }
  const writable = await getWritableOrganizationTargetForUser(
    params.requestUserId,
    params.organizationId,
  );
  if (!writable) {
    throw new Error("Only owner or editor can permanently delete the component");
  }
  if (item.status !== ARCHIVED_REGISTRY_ITEM_STATUS) {
    throw new Error("Permanent delete requires the item to be archived first");
  }

  if (params.ownerRef) {
    const referrers = await findRegistryItemsReferencing(
      params.ownerRef,
      params.name,
      { itemId: item.id, itemName: params.name },
      params.projectKey ?? null,
    );
    const externalReferrers = referrers.filter(
      (r) => !(r.ownerHandle === params.ownerRef && r.itemName === params.name),
    );
    if (externalReferrers.length > 0) {
      const list = externalReferrers
        .slice(0, 20)
        .map((r) => `@${r.ownerHandle}/${r.itemName}`)
        .join(", ");
      throw new Error(
        `Cannot delete: still referenced in registryDependencies by: ${list}${externalReferrers.length > 20 ? " …" : ""}`,
      );
    }
  }

  const [marked] = await db
    .update(registryItems)
    .set({
      status: DELETED_REGISTRY_ITEM_STATUS,
      deletedAt: new Date(),
      deletedBy: params.requestUserId,
      lifecycleReason: params.lifecycleReason ?? item.lifecycleReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(registryItems.id, item.id))
    .returning({ id: registryItems.id });
  if (!marked) throw new Error("Failed to mark registry item deleted");

  await db.delete(registryItems).where(eq(registryItems.id, item.id));
}

export async function copyOrMoveRegistryItemToOrganization(params: {
  sourceOwnerRef: string;
  name: string;
  requestUserId: string;
  targetOrganizationId: string;
  mode: "copy" | "move";
  notes?: string | null;
}) {
  const sourceItem = await getRegistryItemByOwnerNameAndVersion(
    params.sourceOwnerRef,
    params.name,
    null,
    params.requestUserId,
  );
  if (!sourceItem) {
    throw new Error("Source item not found or no access");
  }
  if (!isRegistryItemDirectlyResolvableStatus(sourceItem.status)) {
    throw new Error("Source item is not movable");
  }

  if (sourceItem.organizationId) {
    const sourceWritable = await getWritableOrganizationTargetForUser(
      params.requestUserId,
      sourceItem.organizationId,
    );
    if (!sourceWritable) {
      throw new Error("Only organization editors can move this component");
    }
  } else if (sourceItem.userId !== params.requestUserId) {
    throw new Error("Only owner can move the component");
  }

  const targetWritable = await getWritableOrganizationTargetForUser(
    params.requestUserId,
    params.targetOrganizationId,
  );
  if (!targetWritable) {
    throw new Error("You do not have write access to the target organization");
  }

  const [conflict] = await db
    .select({ id: registryItems.id })
    .from(registryItems)
    .where(
      and(
        eq(registryItems.organizationId, params.targetOrganizationId),
        eq(registryItems.name, params.name),
      ),
    )
    .limit(1);
  if (conflict) {
    throw new Error("Target organization already has an item with this name");
  }

  const currentVersion = getCurrentVersion(sourceItem);
  const targetOwnerRef =
    (await getOrganizationCanonicalOwnerRef(params.targetOrganizationId)) ??
    targetWritable.slug;
  const sourceMeta =
    sourceItem.meta && typeof sourceItem.meta === "object" ? sourceItem.meta : {};
  const targetMeta: Record<string, unknown> = {
    ...sourceMeta,
    movedFrom: `@${params.sourceOwnerRef}/${params.name}`,
    movedFromVersion: currentVersion,
  };

  const rewrittenFiles = (sourceItem.files ?? []).map((file) => ({
    path: file.path,
    type: file.type,
    content: rewriteRegistryFileForOwner({
      ownerId: targetOwnerRef,
      itemName: params.name,
      version: currentVersion,
      path: file.path,
      content: file.content,
      type: file.type,
    }),
  }));

  const [targetItem] = await db
    .insert(registryItems)
    .values({
      userId: null,
      organizationId: params.targetOrganizationId,
      name: sourceItem.name,
      type: sourceItem.type,
      title: sourceItem.title,
      description: sourceItem.description,
      visibility: sourceItem.visibility,
      status: ACTIVE_REGISTRY_ITEM_STATUS,
      dependencies: sourceItem.dependencies ?? [],
      registryDependencies: sourceItem.registryDependencies ?? [],
      meta: targetMeta,
      currentVersion,
    })
    .returning();
  if (!targetItem) {
    throw new Error("Failed to create target registry item");
  }

  if (rewrittenFiles.length > 0) {
    await db.insert(registryFiles).values(
      rewrittenFiles.map((file) => ({
        itemId: targetItem.id,
        path: file.path,
        content: file.content,
        type: file.type,
      })),
    );
  }

  const [targetVersion] = await db
    .insert(registryItemVersions)
    .values({
      itemId: targetItem.id,
      version: currentVersion,
      title: sourceItem.title,
      description: sourceItem.description,
      dependencies: sourceItem.dependencies ?? [],
      registryDependencies: sourceItem.registryDependencies ?? [],
      meta: targetMeta,
      createdBy: params.requestUserId,
    })
    .returning();
  if (!targetVersion) {
    throw new Error("Failed to create target registry version");
  }

  if (rewrittenFiles.length > 0) {
    await db.insert(registryFileVersions).values(
      rewrittenFiles.map((file) => ({
        itemVersionId: targetVersion.id,
        path: file.path,
        content: file.content,
        type: file.type,
      })),
    );
  }

  await db.insert(registryItemMoves).values({
    sourceItemId: sourceItem.id,
    targetItemId: targetItem.id,
    sourceOwnerRef: params.sourceOwnerRef,
    targetOwnerRef,
    mode: params.mode,
    createdBy: params.requestUserId,
    notes: params.notes ?? null,
  });

  await enqueueThumbnailJob({
    itemId: targetItem.id,
    itemVersionId: targetVersion.id,
    payload: {
      ownerId: targetOwnerRef,
      ownerHandle: null,
      name: targetItem.name,
      version: currentVersion,
      type: normalizeRegistryItemType(targetItem.type),
    },
  });

  await enqueuePreviewArtifactJob({
    itemId: targetItem.id,
    itemVersionId: targetVersion.id,
    payload: {
      owner: targetOwnerRef,
      project: targetItem.canonicalProjectKey ?? null,
      name: targetItem.name,
      version: currentVersion,
      mode: "default",
      requestUserId: params.requestUserId,
    },
  });

  if (params.mode === "move") {
    await db
      .update(registryItems)
      .set({
        status: ARCHIVED_REGISTRY_ITEM_STATUS,
        archivedAt: new Date(),
        archivedBy: params.requestUserId,
        lifecycleReason: `Moved to @${targetOwnerRef}/${params.name}`,
        updatedAt: new Date(),
      })
      .where(eq(registryItems.id, sourceItem.id));
  }

  return {
    sourceItemId: sourceItem.id,
    targetItemId: targetItem.id,
    targetOwnerRef,
    version: currentVersion,
    sourceArchived: params.mode === "move",
  };
}

/**
 * 更新组件可见性（public/private）。仅 owner 可操作。
 */
export async function updateRegistryItemVisibility(params: {
  ownerId: string;
  ownerRef?: string;
  projectKey?: string | null;
  name: string;
  requestUserId: string;
  visibility: "public" | "private";
}) {
  const item =
    params.projectKey && params.ownerRef
      ? await getRegistryItemByOwnerProjectName(
          params.ownerRef,
          params.projectKey,
          params.name,
          null,
          params.requestUserId,
        )
      : await getRegistryItemByOwnerAndName(
          params.ownerId,
          params.name,
          params.requestUserId,
        );
  if (!item) {
    throw new Error("Item not found or no access");
  }
  if (item.userId !== params.requestUserId) {
    throw new Error("Only owner can update visibility");
  }
  ensureRegistryItemMutable(item.status);

  const [updated] = await db
    .update(registryItems)
    .set({
      visibility: params.visibility,
      updatedAt: new Date(),
    })
    .where(eq(registryItems.id, item.id))
    .returning();

  if (!updated) throw new Error("Failed to update visibility");
  return updated;
}

export async function updateOrganizationRegistryItemVisibility(params: {
  organizationId: string;
  ownerRef?: string;
  projectKey?: string | null;
  name: string;
  requestUserId: string;
  visibility: "public" | "private";
}) {
  const item =
    params.projectKey && params.ownerRef
      ? await getRegistryItemByOwnerProjectName(
          params.ownerRef,
          params.projectKey,
          params.name,
          null,
          params.requestUserId,
        )
      : await getRegistryItemByOrganizationAndName(params.organizationId, params.name);
  if (!item) {
    throw new Error("Item not found or no access");
  }
  const writable = await getWritableOrganizationTargetForUser(
    params.requestUserId,
    params.organizationId,
  );
  if (!writable) {
    throw new Error("Only owner or editor can update visibility");
  }
  ensureRegistryItemMutable(item.status);

  const [updated] = await db
    .update(registryItems)
    .set({
      visibility: params.visibility,
      updatedAt: new Date(),
    })
    .where(eq(registryItems.id, item.id))
    .returning({
      visibility: registryItems.visibility,
      updatedAt: registryItems.updatedAt,
    });

  return updated;
}

export function toShadcnRegistryItemSummary(item: {
  name: string;
  type: string;
  title: string;
  description: string | null;
  userId?: string | null;
  ownerHandle?: string | null;
}) {
  const owner = item.ownerHandle ?? item.userId ?? "legacy";
  const path = getDefaultRegistryEntryPath(item.type);
  return {
    name: item.name,
    owner,
    type: item.type,
    title: item.title,
    description: item.description ?? undefined,
    files: [{ path, type: item.type }],
  };
}
