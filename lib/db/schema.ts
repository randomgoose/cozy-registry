import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";

// --- Better Auth tables ---
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// OAuth 2.0 authorization codes (for Figma Make / MCP OAuth flow)
export const oauthAuthorizationCode = pgTable("oauth_authorization_code", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  scope: text("scope"),
  state: text("state"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const apiKey = pgTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").default("default").notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id").notNull(),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at"),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_configId_idx").on(table.configId),
    index("apikey_referenceId_idx").on(table.referenceId),
    index("apikey_key_idx").on(table.key),
  ],
);

// --- Registry tables ---
export const registryItems = pgTable(
  "registry_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(), // registry:block, registry:component, etc.
    title: text("title").notNull(),
    description: text("description"),
    visibility: text("visibility").default("public").notNull(), // "public" | "private"
    dependencies: jsonb("dependencies").$type<string[]>().default([]),
    registryDependencies: jsonb("registry_dependencies").$type<string[]>().default([]),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    /** 当前发布版本号，如 "0.1.0"；null 表示旧数据，按 "0.1.0" 处理 */
    currentVersion: text("current_version"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("registry_items_userId_idx").on(table.userId),
    // Per-user unique: each user can have one component per name
    unique("registry_items_user_name_key").on(table.userId, table.name),
  ]
);

export const registryFiles = pgTable("registry_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => registryItems.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull(), // registry:block, registry:component, etc.
});

/** 组件版本历史（每次 Vibe 更新或发布新版本写入） */
export const registryItemVersions = pgTable(
  "registry_item_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => registryItems.id, { onDelete: "cascade" }),
    version: text("version").notNull(), // "0.1.0", "1.2.3"
    title: text("title").notNull(),
    description: text("description"),
    dependencies: jsonb("dependencies").$type<string[]>().default([]),
    registryDependencies: jsonb("registry_dependencies").$type<string[]>().default([]),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    createdBy: text("created_by"), // userId or tool identifier
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("registry_item_versions_itemId_idx").on(table.itemId),
    unique("registry_item_versions_item_version_key").on(table.itemId, table.version),
  ]
);

/** 某版本对应的文件快照 */
export const registryFileVersions = pgTable("registry_file_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemVersionId: uuid("item_version_id")
    .notNull()
    .references(() => registryItemVersions.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull(),
});
