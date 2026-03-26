import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  registryItems,
  registryFiles,
  registryItemVersions,
  registryFileVersions,
  registryCollectionItems,
  team,
  user,
} from "./db/schema";
import { resolveOwner } from "@/lib/owner";
import type { RegistryPolicy } from "@/lib/registry-policy";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { maybeBuildRegistryThumbnail } from "@/lib/thumbnail";
import { enqueueThumbnailJob } from "@/lib/thumbnail-jobs";

const INITIAL_VERSION = "0.1.0";

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
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id))
    .where(
      userId
        ? or(
            eq(registryItems.visibility, "public"),
            and(
              eq(registryItems.visibility, "private"),
              eq(registryItems.userId, userId),
            ),
          )
        : eq(registryItems.visibility, "public"),
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

  const allowedCollectionIds = policy.allowedCollectionIds ?? [];
  const allowPublicOutsideCollections = !!policy.allowPublicOutsideCollections;

  // Strict allowlist behavior:
  // - If no collections are allowlisted and public-outside-collections is false, deny all.
  if (allowedCollectionIds.length === 0 && !allowPublicOutsideCollections) {
    return [];
  }

  const allowedTypes = (policy.allowedTypes ?? []).filter(Boolean);
  const allowedOwners = (policy.allowedOwnerHandlesOrIds ?? []).filter(Boolean);

  const allowedItemIds = (() => {
    if (allowedCollectionIds.length === 0) return [] as string[];
    return db
      .select({ itemId: registryCollectionItems.itemId })
      .from(registryCollectionItems)
      .where(inArray(registryCollectionItems.collectionId, allowedCollectionIds));
  })();

  const visibleClause = requestUserId
    ? or(
        eq(registryItems.visibility, "public"),
        and(
          eq(registryItems.visibility, "private"),
          eq(registryItems.userId, requestUserId),
        ),
      )
    : eq(registryItems.visibility, "public");

  const base = db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      ownerHandle: user.handle,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id));

  const clauses = [visibleClause] as ReturnType<typeof and>[];

  if (allowedTypes.length > 0) {
    clauses.push(inArray(registryItems.type, allowedTypes));
  }

  if (allowedOwners.length > 0) {
    clauses.push(
      or(
        inArray(registryItems.userId, allowedOwners),
        inArray(user.handle, allowedOwners),
      ),
    );
  }

  if (allowedCollectionIds.length > 0) {
    if (allowPublicOutsideCollections) {
      // Public items may be outside collections; non-public items must be in an allowed collection.
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
      )
    );

  if (!item) return null;

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

/**
 * Whether a registry item exists for dependency resolution and whether the caller may read it.
 */
export async function getRegistryDependencyAccessForRef(
  ownerHandle: string,
  itemName: string,
  requestUserId?: string | null,
): Promise<"not_found" | "denied" | "ok"> {
  const resolved = await resolveOwner(ownerHandle);
  if (!resolved) return "not_found";
  const [row] = await db
    .select({
      userId: registryItems.userId,
      visibility: registryItems.visibility,
    })
    .from(registryItems)
    .where(
      and(
        eq(registryItems.userId, resolved.userId),
        eq(registryItems.name, itemName),
      ),
    )
    .limit(1);
  if (!row || !row.userId) return "not_found";
  if (row.visibility === "private" && row.userId !== requestUserId) return "denied";
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
  exclude?: { ownerUserId: string; itemName: string },
): Promise<RegistryItemReferrer[]> {
  const refExact = `@${ownerHandle}/${itemName}`;
  const versionPrefix = `@${ownerHandle}/${itemName}@`;

  const depMatchSnapshot = sql`
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(${registryItems.registryDependencies}, '[]'::jsonb)) AS t(dep)
      WHERE t.dep = ${refExact}
         OR t.dep LIKE ${versionPrefix + "%"}
    )
  `;

  const excludeCond =
    exclude != null
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

/**
 * 按 owner/name 获取组件，可选指定版本。不传 version 或等于当前版本时返回最新快照。
 */
export async function getRegistryItemByOwnerNameAndVersion(
  ownerId: string,
  name: string,
  version: string | null | undefined,
  requestUserId?: string | null
) {
  const resolved = await resolveOwner(ownerId);
  if (!resolved) return null;
  const base = await getRegistryItemByOwnerAndName(resolved.userId, name, requestUserId);
  if (!base) return null;

  const currentVer = getCurrentVersion(base);
  if (!version || version === currentVer) return base;

  const [itemVersion] = await db
    .select()
    .from(registryItemVersions)
    .where(
      and(
        eq(registryItemVersions.itemId, base.id),
        eq(registryItemVersions.version, version)
      )
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
    files: fileVersions.map((f) => ({
      path: f.path,
      content: f.content,
      type: f.type,
    })),
  };
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
    const ownerHandle = (await resolveOwner(item.userId ?? "legacy"))?.handle ?? null;
    const matches =
      (item.userId != null && allowedOwners.includes(item.userId)) ||
      (ownerHandle != null && allowedOwners.includes(ownerHandle));
    if (!matches) return null;
  }

  const allowedCollectionIds = policy.allowedCollectionIds ?? [];
  const allowPublicOutsideCollections = !!policy.allowPublicOutsideCollections;
  if (allowedCollectionIds.length === 0) {
    if (!allowPublicOutsideCollections) return null;
    if (item.visibility !== "public") return null;
    return item;
  }

  // If public outside collections is allowed, only require membership for non-public.
  if (allowPublicOutsideCollections && item.visibility === "public") {
    return item;
  }

  const [membership] = await db
    .select({ itemId: registryCollectionItems.itemId })
    .from(registryCollectionItems)
    .where(
      and(
        eq(registryCollectionItems.itemId, item.id),
        inArray(registryCollectionItems.collectionId, allowedCollectionIds),
      ),
    )
    .limit(1);

  return membership ? item : null;
}

/**
 * 获取组件的版本列表（用于版本选择器 / 升级提示）
 */
export async function getRegistryItemVersions(
  ownerId: string,
  name: string,
  requestUserId?: string | null,
): Promise<
  { version: string; createdAt: Date; createdBy: string | null; message?: string | null }[]
> {
  const item = await getRegistryItemByOwnerAndName(ownerId, name, requestUserId);
  if (!item) return [];

  const versions = await db
    .select({
      version: registryItemVersions.version,
      createdAt: registryItemVersions.createdAt,
      createdBy: registryItemVersions.createdBy,
      meta: registryItemVersions.meta,
    })
    .from(registryItemVersions)
    .where(eq(registryItemVersions.itemId, item.id))
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
 * 发布新版本（Vibe 更新已有组件时调用）。仅组件 owner 可调用。
 */
export async function createRegistryItemVersion(params: {
  ownerId: string;
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
  registryDependencies?: string[];
  /** 可选：更新用于预览的 props（将写回 registry_items.meta.previewProps） */
  previewProps?: unknown;
  /** 可选：强制预览使用的命名导出（将写回 meta.previewExport） */
  previewExport?: string | null;
}) {
  const item = await getRegistryItemByOwnerAndName(
    params.ownerId,
    params.name,
    params.userId
  );
  if (!item) throw new Error("Item not found or no access");
  if (item.userId !== params.userId) throw new Error("Only owner can publish new version");

  const currentVer = getCurrentVersion(item);
  const nextVersion = bumpVersion(currentVer, params.bump);
  const normalizedType = normalizeRegistryItemType(item.type);
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
    const entryPath = item.files[0]?.path
      ?? (normalizedType === REGISTRY_THEME_TYPE
        ? "theme.css"
        : `registry/modules/${params.name}.tsx`);
    return { [entryPath]: params.content };
  })();
  const thumbnail = await maybeBuildRegistryThumbnail({
    type: normalizedType,
    files: normalizedFiles,
    content: params.content,
    ownerId: params.ownerId,
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
      ownerId: params.ownerId,
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

  const [itemVersion] = await db
    .insert(registryItemVersions)
    .values({
      itemId: item.id,
      version: nextVersion,
      title: item.title,
      description: item.description,
      dependencies: item.dependencies ?? [],
      registryDependencies: nextRegistryDependencies,
      meta: ((): Record<string, unknown> => {
        const next: Record<string, unknown> = {
          ...baseMeta,
          message: params.message,
          source: "vibe",
        };
        if (params.previewProps !== undefined) {
          next.previewProps = params.previewProps;
        }
        if (params.previewExport !== undefined) {
          next.previewExport = params.previewExport;
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
      currentVersion: nextVersion,
      registryDependencies: nextRegistryDependencies,
      updatedAt: new Date(),
      ...((params.previewProps !== undefined ||
        params.previewExport !== undefined ||
        thumbnail)
        ? {
            meta: {
              ...baseMeta,
              ...(params.previewProps !== undefined
                ? { previewProps: params.previewProps }
                : {}),
              ...(params.previewExport !== undefined
                ? { previewExport: params.previewExport }
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
      ownerId: params.ownerId,
      ownerHandle: null,
      name: params.name,
      version: nextVersion,
      type: normalizedType,
    },
  });

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
  const publicMatch = items.find((i) => i.visibility === "public");
  const pick = ownerMatch ?? publicMatch ?? items[0];
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
      ownerHandle: user.handle,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
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
 * Get registry items owned by a specific team (for dashboard / team scope).
 */
export async function getRegistryItemsByTeamId(teamId: string) {
  const items = await db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      teamId: registryItems.teamId,
      ownerHandle: user.handle,
      teamName: team.name,
      name: registryItems.name,
      type: registryItems.type,
      title: registryItems.title,
      description: registryItems.description,
      visibility: registryItems.visibility,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id))
    .leftJoin(team, eq(registryItems.teamId, team.id))
    .where(eq(registryItems.teamId, teamId))
    .orderBy(registryItems.name);

  return items;
}

export async function createRegistryItem(data: {
  name: string;
  type: string;
  title: string;
  description?: string | null;
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
  visibility?: "public" | "private";
  dependencies?: string[];
  registryDependencies?: string[];
  /** 用于预览的 props 对象（会存入 registry_items.meta.previewProps） */
  previewProps?: unknown;
  /** 可选：强制预览使用的命名导出（meta.previewExport） */
  previewExport?: string | null;
}) {
  const normalizedType = normalizeRegistryItemType(data.type);
  const normalizedFiles = (() => {
    const files = data.files && Object.keys(data.files).length > 0 ? data.files : null;
    if (files) return files;
    if (!data.content) {
      throw new Error("Either files or content must be provided when creating registry item");
    }
    const singlePath =
      normalizedType === REGISTRY_THEME_TYPE
        ? "theme.css"
        : `registry/modules/${data.name}.tsx`;
    return { [singlePath]: data.content };
  })();
  const thumbnail = await maybeBuildRegistryThumbnail({
    type: normalizedType,
    files: normalizedFiles,
    content: data.content,
    ownerId: data.userId ?? "legacy",
    itemName: data.name,
    version: INITIAL_VERSION,
  });
  const [item] = await db
    .insert(registryItems)
    .values({
      name: data.name,
      type: normalizedType,
      title: data.title,
      description: data.description ?? null,
      userId: data.userId ?? null,
      visibility: data.visibility ?? "public",
      dependencies: data.dependencies ?? [],
      registryDependencies: data.registryDependencies ?? [],
      meta: {
        ...(data.previewProps !== undefined ? { previewProps: data.previewProps } : {}),
        ...(data.previewExport !== undefined
          ? { previewExport: data.previewExport }
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
      ownerId: data.userId,
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
        ownerId: data.userId ?? "legacy",
        ownerHandle: null,
        name: data.name,
        version: INITIAL_VERSION,
        type: normalizedType,
      },
    });
  }

  return item;
}

/**
 * 删除组件（包括所有文件与版本）。仅 owner 可删除。
 * 若 `ownerRef` 与 `name` 给出，则阻止删除仍被其它条目的 `registryDependencies` 引用的组件。
 */
export async function deleteRegistryItem(params: {
  ownerId: string;
  name: string;
  requestUserId: string;
  /** Public owner handle from URL (`@handle/name` 中的 handle) */
  ownerRef?: string;
}) {
  const item = await getRegistryItemByOwnerAndName(
    params.ownerId,
    params.name,
    params.requestUserId,
  );
  if (!item) {
    throw new Error("Item not found or no access");
  }
  if (item.userId !== params.requestUserId) {
    throw new Error("Only owner can delete the component");
  }

  if (params.ownerRef) {
    const referrers = await findRegistryItemsReferencing(
      params.ownerRef,
      params.name,
      { ownerUserId: params.ownerId, itemName: params.name },
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

  await db
    .delete(registryItems)
    .where(
      and(
        eq(registryItems.userId, params.ownerId),
        eq(registryItems.name, params.name),
      ),
    );
}

/**
 * 更新组件可见性（public/private）。仅 owner 可操作。
 */
export async function updateRegistryItemVisibility(params: {
  ownerId: string;
  name: string;
  requestUserId: string;
  visibility: "public" | "private";
}) {
  const item = await getRegistryItemByOwnerAndName(
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

  const [updated] = await db
    .update(registryItems)
    .set({
      visibility: params.visibility,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(registryItems.userId, params.ownerId),
        eq(registryItems.name, params.name),
      ),
    )
    .returning();

  if (!updated) throw new Error("Failed to update visibility");
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
  const path =
    normalizeRegistryItemType(item.type) === REGISTRY_THEME_TYPE
      ? "theme.css"
      : `registry/modules/${item.name}.tsx`;
  return {
    name: item.name,
    owner,
    type: item.type,
    title: item.title,
    description: item.description ?? undefined,
    files: [{ path, type: item.type }],
  };
}
