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
  primaryKey,
} from "drizzle-orm/pg-core";

// --- Better Auth tables ---
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  /** Public owner identifier (immutable once set) */
  handle: text("handle").unique(),
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
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
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

// Better Auth organization plugin tables
export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("organization_slug_idx").on(table.slug)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
    unique("member_organization_user_key").on(table.organizationId, table.userId),
  ],
);

export const team = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("team_organizationId_idx").on(table.organizationId),
    unique("team_organization_name_key").on(table.organizationId, table.name),
    unique("team_organization_slug_key").on(table.organizationId, table.slug),
  ],
);

export const teamMember = pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("team_member_teamId_idx").on(table.teamId),
    index("team_member_userId_idx").on(table.userId),
    unique("team_member_team_user_key").on(table.teamId, table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
    index("invitation_teamId_idx").on(table.teamId),
  ],
);

/** In-app notifications (e.g. team invites for users who already have an account). */
export const userNotification = pgTable(
  "user_notification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    actionUrl: text("action_url"),
    /** Idempotency: e.g. invitation id for `organization_invitation` */
    referenceId: text("reference_id"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_notification_userId_idx").on(table.userId),
    index("user_notification_userId_createdAt_idx").on(table.userId, table.createdAt),
    unique("user_notification_userId_referenceId_key").on(table.userId, table.referenceId),
  ],
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
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
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
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    type: text("type").notNull(), // registry:block, registry:component, etc.
    title: text("title").notNull(),
    description: text("description"),
    visibility: text("visibility").default("public").notNull(), // "public" | "private"
    dependencies: jsonb("dependencies").$type<string[]>().default([]),
    registryDependencies: jsonb("registry_dependencies").$type<string[]>().default([]),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    status: text("status").default("active").notNull(), // active | archived | deleted
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
    lifecycleReason: text("lifecycle_reason"),
    /** 当前发布版本号，如 "0.1.0"；null 表示旧数据，按 "0.1.0" 处理 */
    currentVersion: text("current_version"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("registry_items_userId_idx").on(table.userId),
    index("registry_items_organization_id_idx").on(table.organizationId),
    index("registry_items_status_idx").on(table.status),
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

// --- Registry projects (scoped groups + per-project ACL) ---

export const registryProjects = pgTable(
  "registry_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    visibility: text("visibility").default("private").notNull(), // "public" | "private"
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("registry_projects_organization_id_idx").on(table.organizationId),
    index("registry_projects_owner_user_id_idx").on(table.ownerUserId),
  ],
);

export const registryProjectMembers = pgTable(
  "registry_project_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => registryProjects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"), // owner | admin | editor | viewer
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("registry_project_members_project_id_idx").on(table.projectId),
    index("registry_project_members_user_id_idx").on(table.userId),
    unique("registry_project_members_project_user_key").on(table.projectId, table.userId),
  ],
);

export const registryProjectItems = pgTable(
  "registry_project_items",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => registryProjects.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => registryItems.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.itemId] }),
    index("registry_project_items_project_id_idx").on(table.projectId),
    index("registry_project_items_item_id_idx").on(table.itemId),
  ],
);

export const registryAssetJobs = pgTable(
  "registry_asset_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobType: text("job_type").notNull(), // e.g. generate_thumbnail
    itemId: uuid("item_id")
      .notNull()
      .references(() => registryItems.id, { onDelete: "cascade" }),
    itemVersionId: uuid("item_version_id").references(() => registryItemVersions.id, {
      onDelete: "cascade",
    }),
    status: text("status").default("pending").notNull(), // pending | processing | completed | failed
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastError: text("last_error"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("registry_asset_jobs_itemId_idx").on(table.itemId),
    index("registry_asset_jobs_itemVersionId_idx").on(table.itemVersionId),
    index("registry_asset_jobs_jobType_idx").on(table.jobType),
    index("registry_asset_jobs_status_idx").on(table.status),
  ],
);

export const registryPreviewArtifacts = pgTable(
  "registry_preview_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => registryItems.id, { onDelete: "cascade" }),
    itemVersionId: uuid("item_version_id")
      .notNull()
      .references(() => registryItemVersions.id, { onDelete: "cascade" }),
    mode: text("mode").default("default").notNull(), // default | thumbnail
    storyId: text("story_id").default("").notNull(), // empty means component-level preview
    status: text("status").default("queued").notNull(), // queued | running | ready | failed | skipped
    artifactKey: text("artifact_key").notNull(),
    jsUrl: text("js_url"),
    cssUrl: text("css_url"),
    manifestUrl: text("manifest_url"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("registry_preview_artifacts_item_id_idx").on(table.itemId),
    index("registry_preview_artifacts_item_version_id_idx").on(table.itemVersionId),
    index("registry_preview_artifacts_status_idx").on(table.status),
    unique("registry_preview_artifacts_item_version_mode_key").on(
      table.itemVersionId,
      table.mode,
      table.storyId,
    ),
    unique("registry_preview_artifacts_artifact_key_key").on(table.artifactKey),
  ],
);

export const registryItemMoves = pgTable(
  "registry_item_moves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => registryItems.id, { onDelete: "cascade" }),
    targetItemId: uuid("target_item_id")
      .notNull()
      .references(() => registryItems.id, { onDelete: "cascade" }),
    sourceOwnerRef: text("source_owner_ref").notNull(),
    targetOwnerRef: text("target_owner_ref").notNull(),
    mode: text("mode").notNull(), // copy | move
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    notes: text("notes"),
  },
  (table) => [
    index("registry_item_moves_source_item_id_idx").on(table.sourceItemId),
    index("registry_item_moves_target_item_id_idx").on(table.targetItemId),
  ],
);

export type RegistryApiKeyPolicy = {
  allowedProjectIds: string[];
  allowedTypes: string[];
  allowedOwnerHandlesOrIds?: string[];
  allowPublicOutsideProjects: boolean;
};

export const registryApiKeyPolicies = pgTable(
  "registry_api_key_policies",
  {
    apiKeyId: text("api_key_id")
      .primaryKey()
      .references(() => apiKey.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    ownerOrganizationId: text("owner_organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    allowedProjectIds: jsonb("allowed_project_ids").$type<string[]>().default([]),
    allowedTypes: jsonb("allowed_types").$type<string[]>().default([]),
    allowedOwnerHandlesOrIds: jsonb("allowed_owner_handles_or_ids")
      .$type<string[]>()
      .default([]),
    allowPublicOutsideProjects: boolean("allow_public_outside_collections")
      .default(false)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("registry_api_key_policies_ownerUserId_idx").on(table.ownerUserId),
    index("registry_api_key_policies_owner_organization_id_idx").on(table.ownerOrganizationId),
  ],
);
