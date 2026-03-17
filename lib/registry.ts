import { and, desc, eq, or } from "drizzle-orm";
import { db } from "./db";
import {
  registryItems,
  registryFiles,
  registryItemVersions,
  registryFileVersions,
} from "./db/schema";

const INITIAL_VERSION = "0.1.0";

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
export async function getRegistryItems(userId?: string | null) {
  const items = await db
    .select()
    .from(registryItems)
    .where(
      userId
        ? or(
            eq(registryItems.visibility, "public"),
            and(
              eq(registryItems.visibility, "private"),
              eq(registryItems.userId, userId)
            )
          )
        : eq(registryItems.visibility, "public")
    )
    .orderBy(registryItems.name);

  return items;
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
  const base = await getRegistryItemByOwnerAndName(ownerId, name, requestUserId);
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
    const meta = (v as any).meta as Record<string, unknown> | null | undefined;
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
  content: string;
  bump: "patch" | "minor" | "major";
  userId: string;
  message?: string;
  /** 可选：更新用于预览的 props（将写回 registry_items.meta.previewProps） */
  previewProps?: unknown;
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

  const contentWithHeader = withCozyHeader({
    ownerId: params.ownerId,
    name: params.name,
    version: nextVersion,
    content: params.content,
    format: item.type === "registry:theme" ? "css" : "js",
  });

  const [itemVersion] = await db
    .insert(registryItemVersions)
    .values({
      itemId: item.id,
      version: nextVersion,
      title: item.title,
      description: item.description,
      dependencies: item.dependencies ?? [],
      registryDependencies: item.registryDependencies ?? [],
      meta: ((): Record<string, unknown> => {
        const base =
          typeof item.meta === "object" && item.meta ? item.meta : {};
        const next: Record<string, unknown> = {
          ...base,
          message: params.message,
          source: "vibe",
        };
        if (params.previewProps !== undefined) {
          next.previewProps = params.previewProps;
        }
        return next;
      })(),
      createdBy: params.userId,
    })
    .returning();

  if (!itemVersion) throw new Error("Failed to create version record");

  await db.insert(registryFileVersions).values({
    itemVersionId: itemVersion.id,
    path: item.files[0]?.path ?? `registry/modules/${params.name}.tsx`,
    content: contentWithHeader,
    type: item.type,
  });

  await db
    .update(registryFiles)
    .set({ content: contentWithHeader })
    .where(eq(registryFiles.itemId, item.id));

  await db
    .update(registryItems)
    .set({
      currentVersion: nextVersion,
      updatedAt: new Date(),
      ...(params.previewProps !== undefined
        ? {
            meta: {
              ...(typeof item.meta === "object" && item.meta ? item.meta : {}),
              previewProps: params.previewProps,
            } as Record<string, unknown>,
          }
        : {}),
    })
    .where(eq(registryItems.id, item.id));

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
    type: item.type as "registry:block" | "registry:component" | "registry:theme",
    title: item.title,
    description: item.description ?? undefined,
    dependencies: (item.dependencies ?? []) as string[],
    registryDependencies: (item.registryDependencies ?? []) as string[],
  };

  const files = item.files.map((f) => ({
    path: f.path,
    content: f.content,
    type: f.type as "registry:block" | "registry:component" | "registry:theme",
  }));

  return { ...base, files };
}

/**
 * Get registry items owned by a specific user (for dashboard).
 */
export async function getRegistryItemsByUserId(userId: string) {
  const items = await db
    .select()
    .from(registryItems)
    .where(eq(registryItems.userId, userId))
    .orderBy(registryItems.name);

  return items;
}

export async function createRegistryItem(data: {
  name: string;
  type: string;
  title: string;
  description?: string | null;
  content: string;
  userId?: string | null;
  visibility?: "public" | "private";
  dependencies?: string[];
  /** 用于预览的 props 对象（会存入 registry_items.meta.previewProps） */
  previewProps?: unknown;
}) {
  const [item] = await db
    .insert(registryItems)
    .values({
      name: data.name,
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      userId: data.userId ?? null,
      visibility: data.visibility ?? "public",
      dependencies: data.dependencies ?? [],
      meta:
        data.previewProps !== undefined
          ? { previewProps: data.previewProps }
          : undefined,
      currentVersion: INITIAL_VERSION,
    })
    .returning();

  if (!item) throw new Error("Failed to create registry item");

  const filePath =
    data.type === "registry:theme"
      ? "theme.css"
      : `registry/modules/${data.name}.tsx`;
  const contentWithHeader = withCozyHeader({
    ownerId: data.userId,
    name: data.name,
    version: INITIAL_VERSION,
    content: data.content,
    format: data.type === "registry:theme" ? "css" : "js",
  });
  await db.insert(registryFiles).values({
    itemId: item.id,
    path: filePath,
    content: contentWithHeader,
    type: data.type,
  });

  const [itemVersion] = await db
    .insert(registryItemVersions)
    .values({
      itemId: item.id,
      version: INITIAL_VERSION,
      title: data.title,
      description: data.description ?? null,
      dependencies: data.dependencies ?? [],
      registryDependencies: [],
      meta: { source: "initial" },
      createdBy: data.userId ?? null,
    })
    .returning();

  if (itemVersion) {
    await db.insert(registryFileVersions).values({
      itemVersionId: itemVersion.id,
      path: filePath,
      content: contentWithHeader,
      type: data.type,
    });
  }

  return item;
}

/**
 * 删除组件（包括所有文件与版本）。仅 owner 可删除。
 */
export async function deleteRegistryItem(params: {
  ownerId: string;
  name: string;
  requestUserId: string;
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

  await db
    .delete(registryItems)
    .where(
      and(
        eq(registryItems.userId, params.ownerId),
        eq(registryItems.name, params.name),
      ),
    );
}

export function toShadcnRegistryItemSummary(item: {
  name: string;
  type: string;
  title: string;
  description: string | null;
  userId?: string | null;
}) {
  const owner = item.userId ?? "legacy";
  const path =
    item.type === "registry:theme"
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
