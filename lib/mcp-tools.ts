import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  archiveOrganizationRegistryItem,
  archiveRegistryItem,
  createRegistryItem,
  createRegistryItemVersion,
  getCurrentVersion,
  getRegistryItemByName,
  getRegistryItemByOrganizationAndName,
  getRegistryItemByOwnerNameAndVersion,
  getRegistryItemByOwnerNameAndVersionScoped,
  getRegistryItemsForOrganization,
  getRegistryItemsScoped,
  getRegistryItemVersions,
  toShadcnRegistryItem,
} from "@/lib/registry";
import {
  validateTsx,
  extractDependencies,
  findMissingRelativeImports,
  isRelativeImport,
  validateComponentBundle,
} from "./validate-tsx";
import { isBarePackageSpecifier } from "@/lib/module-specifiers";
import { findAppSpecificUsage } from "@/lib/registry-app-usage-scan";
import { normalizePublishThemeArgs } from "@/lib/theme-publish-args";
import { diagnosePublishReadiness } from "@/lib/diagnose-publish-readiness";
import { normalizeRegistryDependenciesInput } from "@/lib/registry-dependency-input";
import { normalizeThirdPartyDependenciesInput } from "@/lib/third-party-dependency-input";
import {
  evaluateThirdPartyDependencies,
  excludeExplicitRegistryDependencies,
  getRejectedDependencyDecisions,
} from "@/lib/third-party-dependency-governance";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { resolveOwner } from "@/lib/owner";
import {
  getOrganizationCanonicalOwnerRef,
  isUserOrganizationMember,
  resolveOrganizationBySlug,
  resolveOrganizationIdFromLegacyOwnerPath,
} from "@/lib/registry-organization";
import { parseTeamOwnerPath } from "@/lib/registry-team";
import { getRegistryPolicyForApiKey } from "@/lib/registry-policy";
import {
  findAccessibleRegistryProjectBySlug,
  resolveCanonicalRegistryProjectForWrite,
} from "@/lib/registry-project-access";
import { createRegistryProject } from "@/lib/registry-project-create";
import { linkRegistryItemToProject } from "@/lib/registry-project-link-item";
import { db } from "@/lib/db";
import {
  registryFiles,
  registryItems,
  registryProjectItems,
  registryProjectMembers,
  registryProjects,
} from "@/lib/db/schema";
import {
  checkInstalledItemUpdate,
  checkRegistryStatusItemUpdate,
  getProjectRegistryStatus,
  installRegistryBundle,
  readLockfile,
  upgradeInstalledItem,
  type ProjectRegistryStatusItem,
  type RegistryCoordinate,
} from "./install-protocol";
import { getDefaultInstallDir } from "@/lib/registry-install-layout";
import { getBaseUrl } from "@/lib/oauth";
import type { RegistryPolicy } from "@/lib/registry-policy";
import {
  LEGACY_REGISTRY_COMPONENT_TYPE,
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { normalizePublishContract } from "@/lib/registry-publish-contract";
import {
  suggestRegistryDependenciesFromFiles,
  toRegistryCatalogEntries,
} from "@/lib/registry-dependency-suggestions";
import {
  listWritablePublishTargetsForUser,
  resolvePublishTargetForUser,
} from "@/lib/publish-target";
import {
  computeRegistryDependencyHealth,
  formatDependencyHealthForMcp,
} from "@/lib/registry-dependency-health";
import { runRegistryPreviewSmokeTest } from "@/lib/registry-preview-smoke";
import { enqueuePreviewArtifactJob } from "@/lib/preview-artifact-jobs";
import { getPreviewDefaultStoryIdFromMeta } from "@/lib/preview-stories";

/** MCP Tool.annotations (hints for clients; not a security boundary). */
const MCP_ANN = {
  /** Read registry/items; may reach this server’s DB or HTTP APIs (open-world). */
  readOpen: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  } satisfies ToolAnnotations,
  /** Read-only: local project paths or internal DB without external registry fetch. */
  readClosed: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  } satisfies ToolAnnotations,
  /** Writes files / lockfile under a project root. */
  writeProject: {
    readOnlyHint: false,
    destructiveHint: true,
  } satisfies ToolAnnotations,
  /** Create or update registry items (new versions). */
  writeRegistry: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  } satisfies ToolAnnotations,
  /** Remove a registry item and all versions. */
  deleteRegistry: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
  } satisfies ToolAnnotations,
} as const;

export function createRegistryMcpServer(request?: Request) {
  const server = new McpServer({
    name: "cozy",
    version: "1.0.0",
  });

  async function getScopedToolContext() {
    const ctx = request ? await getAuthContextFromToken(request) : null;
    const userId = ctx?.userId ?? null;
    const policy = ctx ? await getRegistryPolicyForApiKey(ctx.apiKeyId) : null;
    return { ctx, userId, policy };
  }

  async function getCanonicalRefOwnerForItem(
    item: { userId?: string | null; organizationId?: string | null },
    fallbackOwner: string,
  ) {
    if (item.organizationId) {
      return (await getOrganizationCanonicalOwnerRef(item.organizationId)) ?? fallbackOwner;
    }
    return (await resolveOwner(item.userId ?? fallbackOwner))?.handle ?? fallbackOwner;
  }

  async function getLatestVersionForItem(params: {
    owner: string;
    name: string;
    userId: string | null;
  }) {
    const versions = await getRegistryItemVersions(
      params.owner,
      params.name,
      params.userId,
    );
    return versions[0]?.version ?? null;
  }

  function buildLockfileEntry(params: {
    owner: string;
    name: string;
    projectSlug?: string | null;
    type: string;
    version: string;
    baseUrl?: string | null;
    files?: { path: string }[];
  }) {
    const sourceBase = params.baseUrl ?? "";
    const sourcePath =
      `/api/r/${encodeURIComponent(params.owner)}/${params.name}?v=${params.version}` +
      (params.projectSlug ? `&project=${encodeURIComponent(params.projectSlug)}` : "");
    const source = sourceBase ? `${sourceBase}${sourcePath}` : sourcePath;
    const withProject = params.projectSlug && params.projectSlug.trim().length > 0;
    const coordinate = withProject
      ? `@${params.owner}/${params.projectSlug}/${params.name}`
      : `@${params.owner}/${params.name}`;
    return {
      version: 1,
      items: {
        [coordinate]: {
          type: params.type,
          version: params.version,
          source,
          installedFiles: (params.files ?? []).map(
            (f) =>
              `${getDefaultInstallDir({ owner: params.owner, projectSlug: params.projectSlug, name: params.name })}/${f.path}`,
          ),
        },
      },
    };
  }

  function getRegistryFetch(): typeof fetch {
    const authHeader = request?.headers.get("authorization");
    const apiKey = request?.headers.get("x-api-key");
    return (input, init) => {
      const headers = new Headers(init?.headers);
      if (authHeader && !headers.has("authorization")) {
        headers.set("authorization", authHeader);
      }
      if (apiKey && !headers.has("x-api-key")) {
        headers.set("x-api-key", apiKey);
      }
      return fetch(input, { ...init, headers });
    };
  }

  async function getAdhocPolicyForProjectSlug(projectSlug: string, requestUserId: string) {
    const project = await findAccessibleRegistryProjectBySlug(requestUserId, projectSlug);
    if (!project) return null;
    const policy: RegistryPolicy = {
      apiKeyId: "__adhoc__",
      ownerUserId: requestUserId,
      allowedProjectIds: [project.id],
      allowedTypes: [],
      allowedOwnerHandlesOrIds: [],
      allowPublicOutsideProjects: false,
    };
    return policy;
  }

  async function attachPublishedItemToProject(
    userId: string,
    project: { id: string; slug: string },
    itemId: string,
  ): Promise<{ ok: true; note: string } | { ok: false; error: string }> {
    const linked = await linkRegistryItemToProject({ userId, projectId: project.id, itemId });
    if (!linked.ok) {
      return { ok: false, error: linked.error };
    }
    return { ok: true, note: `Linked to registry project "${project.slug}".` };
  }

  async function findProjectScopedRegistryItemByName(params: {
    userId: string;
    projectSlug: string;
    name: string;
  }) {
    const project = await findAccessibleRegistryProjectBySlug(params.userId, params.projectSlug);
    if (!project) {
      return { ok: false as const, error: `Project "${params.projectSlug}" not found or you have no access.` };
    }

    const ownershipClause =
      project.organizationId != null
        ? eq(registryItems.organizationId, project.organizationId)
        : project.ownerUserId != null
          ? eq(registryItems.userId, project.ownerUserId)
          : null;
    if (!ownershipClause) {
      return {
        ok: false as const,
        error: `Project "${params.projectSlug}" has no resolvable owner scope.`,
      };
    }

    const [row] = await db
      .select({
        id: registryItems.id,
      })
      .from(registryProjectItems)
      .innerJoin(registryItems, eq(registryProjectItems.itemId, registryItems.id))
      .where(
        and(
          eq(registryProjectItems.projectId, project.id),
          eq(registryItems.name, params.name),
          ownershipClause,
        ),
      )
      .orderBy(desc(registryItems.updatedAt))
      .limit(1);

    if (!row) {
      return { ok: true as const, item: null };
    }

    const [itemBase] = await db
      .select()
      .from(registryItems)
      .where(eq(registryItems.id, row.id))
      .limit(1);
    if (!itemBase) {
      return { ok: true as const, item: null };
    }
    const itemFiles = await db
      .select()
      .from(registryFiles)
      .where(eq(registryFiles.itemId, itemBase.id));
    const item = {
      ...itemBase,
      files: itemFiles,
    };

    return { ok: true as const, item: item ?? null };
  }

  async function findRegistryItemLinkedToProjectByName(params: {
    project: { id: string; organizationId: string | null; ownerUserId: string | null };
    name: string;
  }) {
    const ownershipClause =
      params.project.organizationId != null
        ? eq(registryItems.organizationId, params.project.organizationId)
        : params.project.ownerUserId != null
          ? eq(registryItems.userId, params.project.ownerUserId)
          : null;
    if (!ownershipClause) {
      return { ok: false as const, error: "Project has no resolvable owner scope." };
    }

    const [row] = await db
      .select({
        id: registryItems.id,
      })
      .from(registryProjectItems)
      .innerJoin(registryItems, eq(registryProjectItems.itemId, registryItems.id))
      .where(
        and(
          eq(registryProjectItems.projectId, params.project.id),
          eq(registryItems.name, params.name),
          ownershipClause,
        ),
      )
      .orderBy(desc(registryItems.updatedAt))
      .limit(1);

    if (!row) {
      return { ok: true as const, item: null };
    }

    const [itemBase] = await db
      .select()
      .from(registryItems)
      .where(eq(registryItems.id, row.id))
      .limit(1);
    if (!itemBase) {
      return { ok: true as const, item: null };
    }
    const itemFiles = await db
      .select()
      .from(registryFiles)
      .where(eq(registryFiles.itemId, itemBase.id));

    return {
      ok: true as const,
      item: {
        ...itemBase,
        files: itemFiles,
      },
    };
  }

  async function listRegistryProjectsForMcp() {
    const ctx = request ? await getAuthContextFromToken(request) : null;
    const userId = ctx?.userId ?? null;
    if (!userId) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Authentication required. Add Authorization: Bearer <token>.",
          },
        ],
        isError: true,
      };
    }

    const memberRows = await db
      .select({ projectId: registryProjectMembers.projectId })
      .from(registryProjectMembers)
      .where(eq(registryProjectMembers.userId, userId));
    const memberIds = memberRows.map((r) => r.projectId);
    const ownerClause = eq(registryProjects.ownerUserId, userId);
    const whereClause =
      memberIds.length > 0 ? or(ownerClause, inArray(registryProjects.id, memberIds)) : ownerClause;

    const rows = await db
      .select({
        id: registryProjects.id,
        slug: registryProjects.slug,
        title: registryProjects.title,
        visibility: registryProjects.visibility,
      })
      .from(registryProjects)
      .where(whereClause)
      .orderBy(registryProjects.slug);

    const lines = rows.map((c) => `- **${c.slug}**: ${c.title} (${c.visibility})`).join("\n");
    return {
      content: [
        {
          type: "text" as const,
          text: rows.length ? `Your projects (${rows.length}):\n\n${lines}` : "You have no projects yet.",
        },
      ],
    };
  }

  server.registerTool(
    "list_projects",
    {
      title: "List registry projects",
      description:
        "List your registry projects (slug, title, visibility). Use a slug as the `project` argument on `list_components`, `get_component_in_project`, or `publish_component` to scope or link resources. Prefer this tool over the legacy id `list_collections`.",
      inputSchema: z.object({}).describe("No input required"),
      annotations: MCP_ANN.readClosed,
    },
    listRegistryProjectsForMcp,
  );

  server.registerTool(
    "list_collections",
    {
      title: "List registry projects (legacy tool id)",
      description:
        "Same behavior as `list_projects`. Deprecated MCP tool name only — new integrations should call `list_projects`.",
      inputSchema: z.object({}).describe("No input required"),
      annotations: MCP_ANN.readClosed,
    },
    listRegistryProjectsForMcp,
  );

  server.registerTool(
    "create_project",
    {
      title: "Create registry project",
      description:
        "Create a Cozy registry project to group registry items (blocks, UI, themes). Default scope is personal. For an organization project: set publishScope to organization and **always pass targetRef (e.g. @acme) or organizationSlug** with the workspace slug from list_publish_targets (not the display name). Slug matching is case-insensitive. If you belong to multiple orgs and omit both fields, the call may fail as ambiguous. Same targeting rules as publish_component. Typical flow: list_publish_targets → create_project → publish_component with the same `project` slug. Requires Bearer token.",
      inputSchema: z.object({
        title: z.string().describe("Display name, e.g. Marketing blocks"),
        description: z.string().optional().describe("Optional description"),
        slug: z
          .string()
          .optional()
          .describe(
            "Optional kebab-case slug; if omitted, a unique slug is generated from the title in the target scope.",
          ),
        visibility: z
          .enum(["public", "private"])
          .optional()
          .describe("Defaults to private."),
        publishScope: z
          .enum(["personal", "organization", "team"])
          .optional()
          .describe(
            "personal (default) or organization. For organization, set targetRef or organizationSlug to the workspace slug from list_publish_targets. Legacy team is treated as organization.",
          ),
        targetRef: z
          .string()
          .optional()
          .describe(
            "Required for organization scope when you have multiple writable orgs (recommended always): e.g. @acme. Slug is from list_publish_targets, not the org display name.",
          ),
        organizationSlug: z
          .string()
          .optional()
          .describe(
            "Same as targetRef without @ — workspace slug from list_publish_targets (e.g. acme).",
          ),
      }),
      annotations: MCP_ANN.writeRegistry,
    },
    async (args) => {
      const ctx = request ? await getAuthContextFromToken(request) : null;
      const userId = ctx?.userId ?? null;
      if (!userId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Authentication required. Add Authorization: Bearer <token>.",
            },
          ],
          isError: true,
        };
      }

      const result = await createRegistryProject({
        userId,
        title: args.title,
        description: args.description ?? null,
        slug: args.slug ?? null,
        visibility: args.visibility,
        publishScope: args.publishScope,
        targetRef: args.targetRef ?? null,
        organizationSlug: args.organizationSlug ?? null,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: result.error }],
          isError: true,
        };
      }

      const p = result.project;
      return {
        content: [
          {
            type: "text" as const,
            text: `Created project "${p.title}" (slug: **${p.slug}**, id: \`${p.id}\`, ${p.visibility}). Use \`publish_component\` with \`project: "${p.slug}"\` (and matching publish target) to publish components into this project.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_publish_targets",
    {
      title: "List publish targets",
      description:
        "List the personal scope and every organization you can publish to. Use this before organization publishing when you do not know the target yet. Prefer readable `targetRef` values like `@org-slug`.",
      inputSchema: z.object({}).describe("No input required"),
      annotations: MCP_ANN.readClosed,
    },
    async () => {
      const ctx = request ? await getAuthContextFromToken(request) : null;
      const userId = ctx?.userId ?? null;
      if (!userId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Authentication required. Add Authorization: Bearer <token>.",
            },
          ],
          isError: true,
        };
      }

      const targets = await listWritablePublishTargetsForUser(userId);
      const lines = targets.map((target) => {
        if (target.kind === "user") return `- Personal -> ${target.targetRef}`;
        return `- ${target.name} (${target.slug}) -> ${target.targetRef} (${target.role})`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: lines.length
              ? `Available publish targets:\n\n${lines.join("\n")}`
              : "No publish targets are currently available.",
          },
        ],
      };
    },
  );

  server.registerTool("list_components", {
    title: "List components",
    description:
      "List components and modules available in the registry. Use this to discover what's available before fetching a specific component or before setting `registryDependencies` on publish. Registry dependencies MUST be explicit (see registry-dependency-management-spec §1.1): the system does not auto-link; use `suggest_registry_dependencies` + this list to choose refs. Components are distributed as shadcn-style source bundles (editable TSX), not npm packages. Public components are always listed; private components require Authorization: Bearer <token>. For large registries, pass `limit` (and increase `offset` for the next page) to avoid huge responses—similar to paginated UI lists. To restrict results to items linked to a registry project, pass `project` with the slug from `list_projects`. For organization-owned items, pass `organizationSlug` (e.g. from `list_publish_targets`); org members see private items. Refs use `@orgSlug/itemName`. Legacy `orgSlug/teamSegment` owner paths still resolve to the parent organization.",
    inputSchema: z
      .object({
        organizationSlug: z
          .string()
          .optional()
          .describe(
            "When set, list registry items owned by this organization (requires Bearer token; members with access see private items). Use the organization slug from your workspace or publish targets.",
          ),
        project: z
          .string()
          .optional()
          .describe(
            "Optional project slug to scope results to items linked to that project (e.g. dashboard-blocks). Ad-hoc scope for this call (not API key policy).",
          ),
        collection: z
          .string()
          .optional()
          .describe(
            "Legacy parameter name only — same as `project`. Prefer `project` (registry project slug).",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "Max number of items to return. If omitted, returns the full list (may be very large). Use with `offset` for pagination.",
          ),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Skip this many items (0-based). Only applies when `limit` is set; use the suggested next offset when the response indicates more results.",
          ),
      })
      .describe("Optional project scope, organization catalog, and pagination"),
    annotations: MCP_ANN.readOpen,
  }, async ({ project, collection, limit, offset: offsetArg, organizationSlug }) => {
    const projectSlug = (project ?? collection)?.trim() ?? "";
    const ctx = request ? await getAuthContextFromToken(request) : null;
    const userId = ctx?.userId ?? null;
    const policyFromToken = ctx ? await getRegistryPolicyForApiKey(ctx.apiKeyId) : null;
    const policy =
      projectSlug && userId
        ? await getAdhocPolicyForProjectSlug(projectSlug, userId)
        : policyFromToken;
    const offset = offsetArg ?? 0;
    const fetchLimit = limit != null ? limit + 1 : undefined;

    let items: Awaited<ReturnType<typeof getRegistryItemsScoped>>;
    const orgSlug = organizationSlug?.trim() ?? "";
    if (orgSlug.length > 0) {
      if (!userId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Authentication required to list organization registry items. Add Authorization: Bearer <token>.",
            },
          ],
          isError: true,
        };
      }
      const org = await resolveOrganizationBySlug(orgSlug);
      if (!org) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Organization "${orgSlug}" not found.`,
            },
          ],
          isError: true,
        };
      }
      if (!(await isUserOrganizationMember(userId, org.id))) {
        return {
          content: [
            {
              type: "text" as const,
              text: "You are not a member of this organization or the slug is invalid.",
            },
          ],
          isError: true,
        };
      }
      items = await getRegistryItemsForOrganization(org.id, userId, {
        limit: fetchLimit,
        offset: limit != null ? offset : undefined,
      });
    } else {
      items = await getRegistryItemsScoped({
        requestUserId: userId,
        policy,
        listLimit: fetchLimit,
        listOffset: limit != null ? offset : undefined,
      });
    }

    const hasMore = limit != null && items.length > limit;
    const page = limit != null ? items.slice(0, limit) : items;
    const summary = page
      .map(
        (i) => {
          const row = i as {
            ownerHandle?: string | null;
            userId?: string | null;
            organizationId?: string | null;
            orgSlug?: string | null;
          };
          let ref: string;
          if (row.organizationId && row.orgSlug) {
            ref = `@${row.orgSlug}/${i.name}`;
          } else {
            const owner = row.ownerHandle ?? row.userId ?? "legacy";
            ref = `@${owner}/${i.name}`;
          }
          return `- **${ref}** (${i.type}): ${i.title}${i.description ? ` - ${i.description}` : ""}`;
        }
      )
      .join("\n");

    const paginationNote =
      limit != null
        ? `\n\n_Pagination: showing ${page.length} item(s) (offset ${offset}, limit ${limit}).${hasMore ? ` More available — call again with offset=${offset + limit} (same limit).` : " End of list."}_`
        : "";

    return {
      content: [
        {
          type: "text" as const,
          text: `Available components (${limit != null ? `${page.length} shown${hasMore ? "+" : ""}` : items.length}):\n\n${summary || "(none)"}${paginationNote}`,
        },
      ],
    };
  });

  server.registerTool("suggest_registry_dependencies", {
    title: "Suggest registry dependencies (read-only)",
    description:
      "Analyze a multi-file component bundle (same shape as `publish_component.files`) and suggest which existing registry items might be linked as `registryDependencies`. Read-only: does not write to the database. Uses static imports + optional cozy stub paths; results are suggestions only—confirm before publishing (registry-dependency-management-spec §3.6). Requires Bearer token; optional `project` scopes the catalog like `list_components` (slug from `list_projects`).",
    inputSchema: z.object({
      files: z
        .record(z.string(), z.string())
        .describe(
          "Multi-file bundle map, e.g. { \"index.tsx\": \"...\", \"Button.tsx\": \"...\" }.",
        ),
      project: z
        .string()
        .optional()
        .describe("Optional project slug to scope the catalog (same as list_components `project`)."),
      collection: z
        .string()
        .optional()
        .describe("Legacy parameter name only — same as `project`. Prefer `project`."),
    }),
    annotations: MCP_ANN.readOpen,
  }, async ({ files, project, collection }) => {
    const ctx = request ? await getAuthContextFromToken(request) : null;
    const userId = ctx?.userId ?? null;
    if (!userId) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Authentication required. Add Authorization: Bearer <token>.",
          },
        ],
        isError: true,
      };
    }
    const policyFromToken = ctx ? await getRegistryPolicyForApiKey(ctx.apiKeyId) : null;
    const projectSlug = (project ?? collection)?.trim() ?? "";
    const policy =
      projectSlug && userId
        ? await getAdhocPolicyForProjectSlug(projectSlug, userId)
        : policyFromToken;
    const catalogRows = await getRegistryItemsScoped({
      requestUserId: userId,
      policy,
    });
    const catalog = toRegistryCatalogEntries(catalogRows);
    const suggestions = suggestRegistryDependenciesFromFiles(files, catalog);
    const payload = { suggestions, catalogSize: catalog.length };
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Suggested registry dependencies (${suggestions.length}; catalog ${catalog.length} items). Confirm refs in \`registryDependencies\` before publish.\n\n` +
            `${JSON.stringify(payload, null, 2)}`,
        },
      ],
    };
  });

  server.registerTool(
    "get_component",
    {
      title: "Get component",
      description:
        "Get the main TSX source and metadata for a specific component. Use owner/name when multiple components share the same name. Returns the entry React/TSX code and props interface; future versions may expose additional bundle files.",
      inputSchema: z.object({
        name: z
          .string()
          .describe("Component name, e.g. hero-section, faq, pricing-card"),
        owner: z
          .string()
          .optional()
          .describe(
            "Personal: user handle or id. Organization: organization slug (e.g. `acme`) for `@acme/item`. Legacy `orgSlug/teamSegment` paths still resolve to the org. Required when multiple components share the same name.",
          ),
      }),
      annotations: MCP_ANN.readOpen,
    },
    async ({ name, owner }) => {
      try {
        const { userId, policy } = await getScopedToolContext();

        const item = owner
          ? await getRegistryItemByOwnerNameAndVersionScoped({
              ownerId: owner,
              name,
              version: null,
              requestUserId: userId,
              policy,
            })
          : await getRegistryItemByName(name, userId);

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Component "${name}" not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalRefOwnerForItem(item, owner ?? "legacy");
        const currentVersion = getCurrentVersion(item);
        const latestVersion =
          (await getLatestVersionForItem({
            owner: canonicalOwner,
            name,
            userId,
          })) ?? currentVersion;

        const shadcnItem = toShadcnRegistryItem(item);
        const mainFile = shadcnItem?.files?.[0];
        const rawFileContent = mainFile?.content ?? "";

        // 在入口 TSX 文件顶部注入 cozy-registry 注释头，方便 AI / 工具识别来源与版本
        const installVersion = latestVersion || currentVersion;
        const headerComment = `// cozy-registry: @${canonicalOwner}/${item.name} v${installVersion}\n`;

        const isCodeFile = mainFile
          ? [".tsx", ".ts", ".jsx", ".js"].some((ext) =>
              mainFile.path.toLowerCase().endsWith(ext),
            )
          : false;

        const fileContent =
          isCodeFile && !rawFileContent.startsWith("// cozy-registry:")
            ? `${headerComment}${rawFileContent}`
            : rawFileContent;

        // 生成一个推荐的「锁文件条目」片段，方便用户粘贴到自己的 lock/registry 配置中
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
        const lockSnippet = JSON.stringify(
          buildLockfileEntry({
            owner: canonicalOwner,
            name: item.name,
            type: item.type,
            version: installVersion,
            baseUrl,
            files: shadcnItem?.files,
          }),
          null,
          2,
        );

        const headerLines = [
          `## ${item.title} (@${canonicalOwner}/${item.name})`,
          "",
          item.description || "",
          "",
          `- Current version: v${currentVersion}`,
          `- Latest available: v${latestVersion}`,
          "",
        ];

        const text = `${headerLines.join(
          "\n",
        )}### Usage
Import and use in your React component. Props are defined in the interface.

### Suggested lockfile entry
Add or merge the following into your project's registry/lock file so tools can track this component:

\`\`\`json
${lockSnippet}
\`\`\`

### Source code
\`\`\`tsx
${fileContent}
\`\`\`
`;

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch component "${name}": ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  const getComponentInProjectSchema = z.object({
    project: z
      .string()
      .optional()
      .describe("Registry project slug, e.g. dashboard-blocks (from list_projects)."),
    collection: z
      .string()
      .optional()
      .describe("Legacy parameter name for `project` only — prefer `project`."),
    name: z.string().describe("Component name, e.g. hero-section, faq"),
    owner: z
      .string()
      .optional()
      .describe("Owner handle (preferred) or legacy userId (from list_components)."),
  });

  async function getComponentInProjectForMcp(args: z.infer<typeof getComponentInProjectSchema>) {
    const { project, collection, name, owner } = args;
    const { userId } = await getScopedToolContext();
    if (!userId) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Authentication required. Add Authorization: Bearer <token>.",
          },
        ],
        isError: true,
      };
    }

    const projectSlug = (project ?? collection)?.trim() ?? "";
    if (!projectSlug) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Missing registry project slug: pass `project` (legacy alias: `collection`).",
          },
        ],
        isError: true,
      };
    }

    const adhoc = await getAdhocPolicyForProjectSlug(projectSlug, userId);
    if (!adhoc) {
      return {
        content: [{ type: "text" as const, text: `Project "${projectSlug}" not found or no access.` }],
        isError: true,
      };
    }

    const item = owner
      ? await getRegistryItemByOwnerNameAndVersionScoped({
          ownerId: owner,
          name,
          version: null,
          requestUserId: userId,
          policy: adhoc,
        })
      : await getRegistryItemByOwnerNameAndVersionScoped({
          ownerId: userId,
          name,
          version: null,
          requestUserId: userId,
          policy: adhoc,
        });

    if (!item) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Component "${name}" not found in project "${projectSlug}" (or not allowed).`,
          },
        ],
        isError: true,
      };
    }

    const canonicalOwner = await getCanonicalRefOwnerForItem(item, owner ?? "legacy");
    const currentVersion = getCurrentVersion(item);
    const latestVersion =
      (await getLatestVersionForItem({
        owner: canonicalOwner,
        name,
        userId,
      })) ?? currentVersion;

    const shadcnItem = toShadcnRegistryItem(item);
    const mainFile = shadcnItem?.files?.[0];
    const rawFileContent = mainFile?.content ?? "";
    const installVersion = latestVersion || currentVersion;
    const headerComment = `// cozy-registry: @${canonicalOwner}/${item.name} v${installVersion}\n`;
    const isCodeFile = mainFile
      ? [".tsx", ".ts", ".jsx", ".js"].some((ext) =>
          mainFile.path.toLowerCase().endsWith(ext),
        )
      : false;
    const fileContent =
      isCodeFile && !rawFileContent.startsWith("// cozy-registry:")
        ? `${headerComment}${rawFileContent}`
        : rawFileContent;

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const lockSnippet = JSON.stringify(
      buildLockfileEntry({
        owner: canonicalOwner,
        name: item.name,
        type: item.type,
        version: installVersion,
        baseUrl,
        files: shadcnItem?.files,
      }),
      null,
      2,
    );

    const headerLines = [
      `## ${item.title} (@${canonicalOwner}/${item.name})`,
      "",
      item.description || "",
      "",
      `- Current version: v${currentVersion}`,
      `- Latest available: v${latestVersion}`,
      `- Scoped to registry project: ${projectSlug}`,
      "",
    ];

    const text = `${headerLines.join("\n")}### Usage
Import and use in your React component. Props are defined in the interface.

### Suggested lockfile entry
\`\`\`json
${lockSnippet}
\`\`\`

### Source code
\`\`\`tsx
${fileContent}
\`\`\`
`;

    return { content: [{ type: "text" as const, text }] };
  }

  server.registerTool(
    "get_component_in_project",
    {
      title: "Get component (scoped to registry project)",
      description:
        "Fetch a component only if it is linked to the given registry project slug. Use when assembling UI from one project’s resources. Prefer this tool over the legacy id `get_component_in_collection`.",
      inputSchema: getComponentInProjectSchema,
      annotations: MCP_ANN.readOpen,
    },
    getComponentInProjectForMcp,
  );

  server.registerTool(
    "get_component_in_collection",
    {
      title: "Get component scoped to project (legacy tool id)",
      description:
        "Same behavior as `get_component_in_project`. Deprecated MCP tool name only.",
      inputSchema: getComponentInProjectSchema,
      annotations: MCP_ANN.readOpen,
    },
    getComponentInProjectForMcp,
  );

  server.registerTool(
    "get_component_versions",
    {
      title: "Get component versions",
      description:
        "List all versions of a specific component, along with creation time and author. Use this to decide whether to upgrade a component in a project.",
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            "Component name in kebab-case, e.g. hero-section, trading-button",
          ),
        owner: z
          .string()
          .describe(
            "Personal: user handle or id. Organization: org slug or legacy `orgSlug/teamSegment` (from list_components). Required to disambiguate components with the same name.",
          ),
      }),
      annotations: MCP_ANN.readOpen,
    },
    async ({ name, owner }) => {
      try {
        const ctx = request ? await getAuthContextFromToken(request) : null;
        const policy = ctx ? await getRegistryPolicyForApiKey(ctx.apiKeyId) : null;
        const userId = ctx?.userId ?? null;

        // Enforce token scope: if the item itself is not allowed, don't leak version history.
        const allowed = await getRegistryItemByOwnerNameAndVersionScoped({
          ownerId: owner,
          name,
          version: null,
          requestUserId: userId,
          policy,
        });
        if (!allowed) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Component @${owner}/${name} not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalRefOwnerForItem(allowed, owner);
        const versions = await getRegistryItemVersions(owner, name, userId);
        if (!versions.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No versions found for @${canonicalOwner}/${name}.`,
              },
            ],
            isError: true,
          };
        }

        const lines: string[] = [];
        lines.push(`## Versions for @${canonicalOwner}/${name}`);
        lines.push("");
        lines.push("All versions (newest first):");
        lines.push("");

        const latest = versions[0];
        const latestDateIso =
          typeof latest.createdAt === "string"
            ? latest.createdAt
            : latest.createdAt.toISOString();
        lines.push(
          `Latest: v${latest.version} (createdAt: ${latestDateIso}${
            latest.message ? `, message: ${latest.message}` : ""
          })`,
        );
        lines.push("");

        for (const v of versions) {
          const dateIso =
            typeof v.createdAt === "string"
              ? v.createdAt
              : v.createdAt.toISOString();
          lines.push(
            `- v${v.version} (createdAt: ${dateIso}, createdBy: ${
              v.createdBy ?? "unknown"
            }${v.message ? `, message: ${v.message}` : ""})`,
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch versions for @${owner}/${name}: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "check_component_update",
    {
      title: "Check component update",
      description:
        "Check whether an installed registry item has a newer version available. Use this when a project already has an installed version and you want to know if it can be upgraded.",
      inputSchema: z.object({
        name: z.string().describe("Component name in kebab-case, e.g. hero-section"),
        owner: z
          .string()
          .describe("Owner handle (preferred) or legacy userId for the installed item."),
        installedVersion: z
          .string()
          .describe("Currently installed version in the project, e.g. 0.3.0"),
      }),
      annotations: MCP_ANN.readOpen,
    },
    async ({ name, owner, installedVersion }) => {
      try {
        const { userId, policy } = await getScopedToolContext();
        const item = await getRegistryItemByOwnerNameAndVersionScoped({
          ownerId: owner,
          name,
          version: null,
          requestUserId: userId,
          policy,
        });

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Component @${owner}/${name} not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalRefOwnerForItem(item, owner);
        const latestVersion = getCurrentVersion(item);
        const upgradable = installedVersion !== latestVersion;
        const payload = {
          ok: true,
          item: {
            coordinate: `@${canonicalOwner}/${item.name}`,
            type: item.type,
            installedVersion,
            latestVersion,
            upgradable,
            hasConflicts: false,
          },
          summary: upgradable
            ? `Upgradable from v${installedVersion} to v${latestVersion}.`
            : `Already up to date at v${installedVersion}.`,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to check updates for @${owner}/${name}: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "plan_component_install",
    {
      title: "Plan component install",
      description:
        "Plan how a Cozy registry item should be installed without writing to the local filesystem. Use this in remote AI environments like Figma Make when you need the target paths, lockfile entry, and whether the item appears already installed based on an optional project status snapshot.",
      inputSchema: z.object({
        name: z.string().describe("Component name in kebab-case, e.g. hero-section"),
        owner: z
          .string()
          .describe("Owner handle (preferred) or legacy userId."),
        project: z
          .string()
          .optional()
          .describe("Optional registry project slug. When set, resolves this component within that project."),
        version: z
          .string()
          .optional()
          .describe("Optional target version. Defaults to the current latest version."),
        projectStatus: z
          .object({
            lockfileExists: z.boolean().optional(),
            items: z
              .array(
                z.object({
                  coordinate: z.string(),
                  type: z.string().optional(),
                  version: z.string().optional(),
                  source: z.string().optional(),
                  installedFiles: z.array(z.string()).optional(),
                }),
              )
              .optional(),
          })
          .optional()
          .describe(
            "Optional install-state snapshot, usually from get_project_registry_status, used only to determine whether this would be a first install or a lockfile update.",
          ),
      }),
      annotations: MCP_ANN.readOpen,
    },
    async ({ name, owner, project, version, projectStatus }) => {
      try {
        const { userId, policy } = await getScopedToolContext();
        const projectSlug = project?.trim() || null;
        let item;
        if (!projectSlug || !userId) {
          item = await getRegistryItemByOwnerNameAndVersionScoped({
            ownerId: owner,
            name,
            version: version ?? null,
            requestUserId: userId,
            policy,
          });
        } else {
          const scoped = await findProjectScopedRegistryItemByName({
            userId,
            projectSlug,
            name,
          });
          if (!scoped.ok) throw new Error(scoped.error);
          item = scoped.item;
        }

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: projectSlug
                  ? `Component @${owner}/${name}${version ? `@${version}` : ""} not found in project "${projectSlug}" (or not allowed by your token scope).`
                  : `Component @${owner}/${name}${version ? `@${version}` : ""} not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalRefOwnerForItem(item, owner);
        const selectedVersion = version?.trim() || getCurrentVersion(item);
        const shadcnItem = toShadcnRegistryItem(item);
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
        const coordinate = (
          projectSlug
            ? `@${canonicalOwner}/${projectSlug}/${item.name}`
            : `@${canonicalOwner}/${item.name}`
        ) as RegistryCoordinate;
        const targetDir = getDefaultInstallDir({
          owner: canonicalOwner,
          projectSlug,
          name: item.name,
        });
        const installedFiles = (shadcnItem?.files ?? []).map(
          (file) => `${targetDir}/${file.path}`,
        );
        const existingItem =
          projectStatus?.items?.find((entry) => entry.coordinate === coordinate) ?? null;
        const alreadyInstalled = !!existingItem;
        const registeredVersion = existingItem?.version ?? null;
        const installMode = !alreadyInstalled
          ? "first_install"
          : registeredVersion === selectedVersion
            ? "already_installed_same_version"
            : "update_lockfile_entry";
        const wouldUpdateLockfile =
          !alreadyInstalled || registeredVersion !== selectedVersion;

        const payload = {
          ok: true,
          action: "plan_install",
          scopeType: projectSlug ? "project" : "global",
          coordinate,
          type: item.type,
          version: selectedVersion,
          installMode,
          source: baseUrl
            ? `${baseUrl}/api/r/${canonicalOwner}/${item.name}?v=${selectedVersion}${projectSlug ? `&project=${encodeURIComponent(projectSlug)}` : ""}`
            : `/api/r/${canonicalOwner}/${item.name}?v=${selectedVersion}${projectSlug ? `&project=${encodeURIComponent(projectSlug)}` : ""}`,
          targetDir,
          installedFiles,
          files: shadcnItem?.files ?? [],
          lockfileEntry: buildLockfileEntry({
            owner: canonicalOwner,
            name: item.name,
            projectSlug,
            type: item.type,
            version: selectedVersion,
            baseUrl,
            files: shadcnItem?.files,
          }),
          lockfileCheck: {
            providedStatus: !!projectStatus,
            lockfileExists: projectStatus?.lockfileExists ?? null,
            alreadyInstalled,
            registeredVersion,
            wouldUpdateLockfile,
          },
          summary:
            installMode === "first_install"
              ? `Plan a first install for ${coordinate} at v${selectedVersion}.`
              : installMode === "already_installed_same_version"
                ? `${coordinate} already appears installed at v${selectedVersion}.`
                : `Plan to update the lockfile entry for ${coordinate} from v${registeredVersion} to v${selectedVersion}.`,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to plan install for @${owner}/${name}${version ? `@${version}` : ""}: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "plan_component_upgrade",
    {
      title: "Plan component upgrade",
      description:
        "Plan how an installed Cozy registry item should be upgraded without writing to the local filesystem. Use this in remote AI environments to compare the registered version with a target version and preview the next lockfile entry.",
      inputSchema: z.object({
        coordinate: z
          .string()
          .describe("Installed coordinate to upgrade, e.g. @acme/hero-section or @acme/dashboard/hero-section."),
        toVersion: z
          .string()
          .optional()
          .describe("Optional target version. Defaults to the current latest version."),
        projectStatus: z
          .object({
            lockfileExists: z.boolean().optional(),
            items: z
              .array(
                z.object({
                  coordinate: z.string(),
                  type: z.string().optional(),
                  version: z.string().optional(),
                  source: z.string().optional(),
                  installedFiles: z.array(z.string()).optional(),
                }),
              )
              .optional(),
          })
          .describe(
            "Install-state snapshot, usually from get_project_registry_status. This is required so the planner knows which version is currently registered.",
          ),
      }),
      annotations: MCP_ANN.readOpen,
    },
    async ({ coordinate, toVersion, projectStatus }) => {
      try {
        if (!coordinate.startsWith("@")) {
          throw new Error(`Invalid coordinate: ${coordinate}`);
        }
        const parts = coordinate.slice(1).split("/");
        if (parts.length < 2 || parts.length > 3) {
          throw new Error(`Invalid coordinate: ${coordinate}`);
        }
        const owner = parts[0]!;
        const projectSlug = parts.length === 3 ? parts[1]! : null;
        const name = parts.length === 3 ? parts[2]! : parts[1]!;
        const existingItem =
          projectStatus.items?.find((entry) => entry.coordinate === coordinate) ?? null;

        if (!existingItem?.version) {
          throw new Error(
            `Registered version not found for ${coordinate}. Provide projectStatus from get_project_registry_status first.`,
          );
        }

        const { userId, policy } = await getScopedToolContext();
        let item;
        if (!projectSlug || !userId) {
          item = await getRegistryItemByOwnerNameAndVersionScoped({
            ownerId: owner,
            name,
            version: toVersion ?? null,
            requestUserId: userId,
            policy,
          });
        } else {
          const scoped = await findProjectScopedRegistryItemByName({
            userId,
            projectSlug,
            name,
          });
          if (!scoped.ok) throw new Error(scoped.error);
          item = scoped.item;
        }

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Component ${coordinate}${toVersion ? `@${toVersion}` : ""} not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalRefOwnerForItem(item, owner);
        const latestVersion = getCurrentVersion(item);
        const targetVersion = toVersion?.trim() || latestVersion;
        const shadcnItem = toShadcnRegistryItem(item);
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
        const canonicalCoordinate = (
          projectSlug
            ? `@${canonicalOwner}/${projectSlug}/${item.name}`
            : `@${canonicalOwner}/${item.name}`
        ) as RegistryCoordinate;
        const targetDir = getDefaultInstallDir({
          owner: canonicalOwner,
          projectSlug,
          name: item.name,
        });
        const installedFiles =
          existingItem.installedFiles?.length
            ? existingItem.installedFiles
            : (shadcnItem?.files ?? []).map(
                (file) => `${targetDir}/${file.path}`,
              );
        const alreadyUpToDate = existingItem.version === targetVersion;

        const payload = {
          ok: true,
          action: "plan_upgrade",
          scopeType: projectSlug ? "project" : "global",
          coordinate: canonicalCoordinate,
          type: item.type,
          installedVersion: existingItem.version,
          latestVersion,
          targetVersion,
          upgradeMode: alreadyUpToDate ? "already_up_to_date" : "upgrade_available",
          source: baseUrl
            ? `${baseUrl}/api/r/${canonicalOwner}/${item.name}?v=${targetVersion}${projectSlug ? `&project=${encodeURIComponent(projectSlug)}` : ""}`
            : `/api/r/${canonicalOwner}/${item.name}?v=${targetVersion}${projectSlug ? `&project=${encodeURIComponent(projectSlug)}` : ""}`,
          targetDir,
          installedFiles,
          files: shadcnItem?.files ?? [],
          nextLockfileEntry: buildLockfileEntry({
            owner: canonicalOwner,
            name: item.name,
            projectSlug,
            type: item.type,
            version: targetVersion,
            baseUrl,
            files: shadcnItem?.files,
          }),
          lockfileCheck: {
            providedStatus: true,
            lockfileExists: projectStatus.lockfileExists ?? null,
            alreadyInstalled: true,
            registeredVersion: existingItem.version,
            wouldUpdateLockfile: !alreadyUpToDate,
          },
          summary: alreadyUpToDate
            ? `${canonicalCoordinate} already appears up to date at v${targetVersion}.`
            : `Plan to upgrade ${canonicalCoordinate} from v${existingItem.version} to v${targetVersion}.`,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to plan upgrade for ${coordinate}: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "install_component_bundle",
    {
      title: "Install component bundle",
      description:
        "Install a registry block/component bundle into a local project, write files under the default install path, and update cozy-registry.lock.json. Use this instead of manually copying files when you need Cozy install tracking. This requires a projectRoot that is writable by the MCP runtime.",
      inputSchema: z.object({
        projectRoot: z
          .string()
          .describe("Absolute path to the target project root where files should be installed."),
        project: z
          .string()
          .optional()
          .describe("Optional registry project slug. When set, resolves the component within that project only."),
        name: z.string().describe("Component name in kebab-case, e.g. hero-section"),
        owner: z
          .string()
          .describe("Owner handle (preferred) or legacy userId."),
        version: z
          .string()
          .optional()
          .describe("Optional target version. Defaults to the current latest version."),
      }),
      annotations: MCP_ANN.writeProject,
    },
    async ({ projectRoot, project, name, owner, version }) => {
      try {
        const { userId, policy } = await getScopedToolContext();
        const projectSlug = project?.trim() || null;
        let item;
        if (!projectSlug || !userId) {
          item = await getRegistryItemByOwnerNameAndVersionScoped({
            ownerId: owner,
            name,
            version: version ?? null,
            requestUserId: userId,
            policy,
          });
        } else {
          const scoped = await findProjectScopedRegistryItemByName({
            userId,
            projectSlug,
            name,
          });
          if (!scoped.ok) throw new Error(scoped.error);
          item = scoped.item;
        }

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: project?.trim()
                  ? `Component @${owner}/${name}${version ? `@${version}` : ""} not found in project "${project.trim()}" (or not allowed by your token scope).`
                  : `Component @${owner}/${name}${version ? `@${version}` : ""} not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalRefOwnerForItem(item, owner);
        const selectedVersion = version?.trim() || getCurrentVersion(item);
        const shadcnItem = toShadcnRegistryItem(item);
        const coordinate = projectSlug
          ? (`@${canonicalOwner}/${projectSlug}/${item.name}` as RegistryCoordinate)
          : (`@${canonicalOwner}/${item.name}` as RegistryCoordinate);
        const sourceUrl = new URL(
          `/api/r/${encodeURIComponent(canonicalOwner)}/${item.name}`,
          getBaseUrl(),
        );
        sourceUrl.searchParams.set("v", selectedVersion);
        if (projectSlug) {
          sourceUrl.searchParams.set("project", projectSlug);
        }
        const source = sourceUrl.toString();
        const result = await installRegistryBundle({
          projectRoot,
          coordinate,
          type: item.type,
          version: selectedVersion,
          source,
          files: shadcnItem?.files ?? [],
          registryDependencies: (item.registryDependencies ?? []) as string[],
          registryBaseUrl: getBaseUrl(),
          fetchImpl: getRegistryFetch(),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to install component bundle: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_project_registry_status",
    {
      title: "Get project registry status",
      description:
        "Inspect a local project's Cozy install state. Use this to verify whether cozy-registry.lock.json exists and whether a component is actually registered there after installation.",
      inputSchema: z.object({
        projectRoot: z
          .string()
          .describe("Absolute path to the target project root."),
        coordinate: z
          .string()
          .optional()
          .describe("Optional specific coordinate to inspect, e.g. @acme/hero-section."),
      }),
      annotations: MCP_ANN.readClosed,
    },
    async ({ projectRoot, coordinate }) => {
      try {
        const payload = await getProjectRegistryStatus({
          projectRoot,
          coordinate: coordinate as RegistryCoordinate | undefined,
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
          isError: !payload.lockfileExists,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to read project registry status: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "analyze_project_registry",
    {
      title: "Analyze project registry",
      description:
        "Summarize a project's Cozy install state and upgrade opportunities in one response. This works either with a live projectRoot or with a previously captured projectStatus snapshot, so it is suitable for Figma Make and other remote AI tools.",
      inputSchema: z.object({
        projectRoot: z
          .string()
          .optional()
          .describe("Optional absolute path to the target project root."),
        projectStatus: z
          .object({
            projectRoot: z.string().optional(),
            lockfilePath: z.string().optional(),
            lockfileExists: z.boolean().optional(),
            itemCount: z.number().optional(),
            items: z
              .array(
                z.object({
                  coordinate: z.string(),
                  type: z.string(),
                  version: z.string(),
                  source: z.string(),
                  installedFiles: z.array(z.string()),
                }),
              )
              .optional(),
            summary: z.string().optional(),
          })
          .optional()
          .describe(
            "Optional install-state snapshot, usually from get_project_registry_status. Use this in remote AI tools when projectRoot is not available.",
          ),
        coordinate: z
          .string()
          .optional()
          .describe("Optional specific coordinate to focus on, e.g. @acme/hero-section."),
      }),
      annotations: MCP_ANN.readOpen,
    },
    async ({ projectRoot, projectStatus, coordinate }) => {
      try {
        let statusPayload:
          | {
              projectRoot: string;
              lockfilePath: string;
              lockfileExists: boolean;
              itemCount: number;
              items: ProjectRegistryStatusItem[];
              summary: string;
            }
          | undefined;

        if (projectRoot?.trim()) {
          statusPayload = await getProjectRegistryStatus({
            projectRoot,
            coordinate: coordinate as RegistryCoordinate | undefined,
          });
        } else if (projectStatus) {
          const items = (projectStatus.items ?? [])
            .filter((item) =>
              coordinate ? item.coordinate === coordinate : true,
            )
            .map((item) => ({
              coordinate: item.coordinate as RegistryCoordinate,
              type: item.type,
              version: item.version,
              source: item.source,
              installedFiles: item.installedFiles,
            }));

          statusPayload = {
            projectRoot: projectStatus.projectRoot ?? "",
            lockfilePath: projectStatus.lockfilePath ?? "cozy-registry.lock.json",
            lockfileExists: projectStatus.lockfileExists ?? false,
            itemCount: items.length,
            items,
            summary:
              projectStatus.summary ??
              (items.length === 0
                ? "No installed Cozy Registry items were provided."
                : `Received ${items.length} installed item${items.length === 1 ? "" : "s"} from projectStatus.`),
          };
        }

        if (!statusPayload) {
          throw new Error(
            "Provide either projectRoot or projectStatus so Cozy can analyze the install state.",
          );
        }

        if (!statusPayload.lockfileExists || statusPayload.items.length === 0) {
          const emptyPayload = {
            ok: true,
            state: statusPayload.lockfileExists ? "no_installed_items" : "missing_lockfile",
            project: {
              projectRoot: statusPayload.projectRoot,
              lockfilePath: statusPayload.lockfilePath,
              lockfileExists: statusPayload.lockfileExists,
              itemCount: statusPayload.items.length,
            },
            items: [],
            summary: statusPayload.summary,
            recommendedActions: statusPayload.lockfileExists
              ? [
                  "Install a block first, then run this analysis again.",
                  "If you are in Figma Make, ask for get_component_bundle and plan_component_install before attempting installation.",
                ]
              : [
                  "Create or update cozy-registry.lock.json by installing a Cozy block into the project.",
                  "If you are in a remote AI tool, use get_project_registry_status after installation and pass the result back into analyze_project_registry.",
                ],
          };

          return {
            content: [{ type: "text" as const, text: JSON.stringify(emptyPayload, null, 2) }],
          };
        }

        const fetchImpl = getRegistryFetch();
        const items = [];
        for (const item of statusPayload.items) {
          const update = await checkRegistryStatusItemUpdate({
            item,
            registryBaseUrl: getBaseUrl(),
            fetchImpl,
          });

          items.push({
            coordinate: update.item.coordinate,
            type: update.item.type,
            installedVersion: update.item.installedVersion,
            latestVersion: update.item.latestVersion,
            upgradable: update.item.upgradable,
            installedFiles: update.item.installedFiles,
            source: update.item.source,
            recommendedAction: update.item.upgradable
              ? `Plan an upgrade for ${update.item.coordinate}.`
              : `Keep ${update.item.coordinate} at v${update.item.installedVersion}.`,
          });
        }

        const upgradableItems = items.filter((item) => item.upgradable);
        const payload = {
          ok: true,
          state: upgradableItems.length > 0 ? "updates_available" : "up_to_date",
          project: {
            projectRoot: statusPayload.projectRoot,
            lockfilePath: statusPayload.lockfilePath,
            lockfileExists: statusPayload.lockfileExists,
            itemCount: items.length,
          },
          items,
          summary:
            upgradableItems.length > 0
              ? `${upgradableItems.length} of ${items.length} installed item${items.length === 1 ? "" : "s"} can be upgraded.`
              : `All ${items.length} installed item${items.length === 1 ? "" : "s"} are up to date.`,
          recommendedActions:
            upgradableItems.length > 0
              ? [
                  "Use plan_component_upgrade for the highest-priority item before attempting an upgrade.",
                  "If you are in a local runtime with filesystem access, you can then run upgrade_component_in_project.",
                ]
              : [
                  "No upgrade is required right now.",
                  "If you are evaluating a new block, use get_component_bundle and plan_component_install for the next install.",
                ],
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to analyze project registry status: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "check_project_updates",
    {
      title: "Check project updates",
      description:
        "Read cozy-registry.lock.json from a local project and report which installed registry items can be upgraded.",
      inputSchema: z.object({
        projectRoot: z
          .string()
          .describe("Absolute path to the target project root containing cozy-registry.lock.json."),
        coordinate: z
          .string()
          .optional()
          .describe("Optional specific coordinate to check, e.g. @acme/hero-section."),
      }),
      annotations: MCP_ANN.readOpen,
    },
    async ({ projectRoot, coordinate }) => {
      try {
        const lockfile = await readLockfile(projectRoot);
        const coordinates = coordinate
          ? [coordinate as RegistryCoordinate]
          : (Object.keys(lockfile.items) as RegistryCoordinate[]);
        const fetchImpl = getRegistryFetch();
        const items = [];
        for (const itemCoordinate of coordinates) {
          const result = await checkInstalledItemUpdate({
            projectRoot,
            coordinate: itemCoordinate,
            registryBaseUrl: getBaseUrl(),
            fetchImpl,
          });
          items.push(result.item);
        }

        const payload = {
          ok: true,
          items,
          summary: {
            total: items.length,
            upgradable: items.filter((item) => item.upgradable).length,
            blockedByConflicts: items.filter((item) => item.hasConflicts).length,
          },
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to check project updates: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "upgrade_component_in_project",
    {
      title: "Upgrade component in project",
      description:
        "Upgrade an installed Cozy registry item inside a local project. This reads cozy-registry.lock.json, checks for conflicts, and updates files plus the lockfile.",
      inputSchema: z.object({
        projectRoot: z
          .string()
          .describe("Absolute path to the target project root containing cozy-registry.lock.json."),
        coordinate: z
          .string()
          .describe("Installed coordinate to upgrade, e.g. @acme/hero-section or @acme/dashboard/hero-section."),
        toVersion: z
          .string()
          .optional()
          .describe("Optional explicit target version. Defaults to latest."),
        force: z
          .boolean()
          .optional()
          .describe("Whether to overwrite locally modified files when conflicts are detected."),
      }),
      annotations: MCP_ANN.writeProject,
    },
    async ({ projectRoot, coordinate, toVersion, force }) => {
      try {
        const result = await upgradeInstalledItem({
          projectRoot,
          coordinate: coordinate as RegistryCoordinate,
          toVersion,
          force,
          registryBaseUrl: getBaseUrl(),
          fetchImpl: getRegistryFetch(),
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.ok,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to upgrade installed component: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_component_bundle",
    {
      title: "Get component bundle",
      description:
        "Get the full source bundle for a specific component or block version. Use this for install and upgrade flows, especially for multi-file registry:block bundles.",
      inputSchema: z.object({
        name: z.string().describe("Component name in kebab-case, e.g. hero-section"),
        owner: z
          .string()
          .describe(
            "Personal: user handle or id. Organization: org slug or legacy `orgSlug/teamSegment`.",
          ),
        project: z
          .string()
          .optional()
          .describe("Optional registry project slug. When set, resolves bundle inside that project."),
        version: z
          .string()
          .optional()
          .describe("Optional target version. Defaults to the current latest version."),
      }),
      annotations: MCP_ANN.readOpen,
    },
    async ({ name, owner, project, version }) => {
      try {
        const { userId, policy } = await getScopedToolContext();
        const projectSlug = project?.trim() || null;
        let item;
        if (!projectSlug || !userId) {
          item = await getRegistryItemByOwnerNameAndVersionScoped({
            ownerId: owner,
            name,
            version: version ?? null,
            requestUserId: userId,
            policy,
          });
        } else {
          const scoped = await findProjectScopedRegistryItemByName({
            userId,
            projectSlug,
            name,
          });
          if (!scoped.ok) throw new Error(scoped.error);
          item = scoped.item;
        }

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: projectSlug
                  ? `Component @${owner}/${name}${version ? `@${version}` : ""} not found in project "${projectSlug}" (or not allowed by your token scope).`
                  : `Component @${owner}/${name}${version ? `@${version}` : ""} not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalRefOwnerForItem(item, owner);
        const selectedVersion = version?.trim() || getCurrentVersion(item);
        const shadcnItem = toShadcnRegistryItem(item);
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
        const rPath = `/api/r/${encodeURIComponent(canonicalOwner)}/${item.name}?v=${selectedVersion}${projectSlug ? `&project=${encodeURIComponent(projectSlug)}` : ""}`;
        const payload = {
          ok: true,
          item: {
            scopeType: projectSlug ? "project" : "global",
            coordinate: projectSlug
              ? `@${canonicalOwner}/${projectSlug}/${item.name}`
              : `@${canonicalOwner}/${item.name}`,
            type: item.type,
            version: selectedVersion,
            source: baseUrl ? `${baseUrl}${rPath}` : rPath,
            files: shadcnItem?.files ?? [],
          },
          lockfileEntry: buildLockfileEntry({
            owner: canonicalOwner,
            name: item.name,
            projectSlug,
            type: item.type,
            version: selectedVersion,
            baseUrl,
            files: shadcnItem?.files,
          }),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch bundle for @${owner}/${name}${version ? `@${version}` : ""}: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool("delete_component", {
    title: "Delete component",
    description: "Delete a component you own from the registry, including all its versions. Use this when the user explicitly asks to remove a component. Requires Bearer token.",
    inputSchema: z.object({
      name: z
        .string()
        .describe("Component name in kebab-case, e.g. hero-section"),
      owner: z
        .string()
        .optional()
        .describe(
          "Owner handle (preferred) or legacy userId (from list_components). If omitted, assumes the current authenticated user.",
        ),
    }),
    annotations: MCP_ANN.deleteRegistry,
  }, async ({ name, owner }) => {
    try {
      const ctx = request ? await getAuthContextFromToken(request) : null;
      const userId = ctx?.userId ?? null;
      if (!userId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Authentication required. Add Authorization: Bearer <your-token>.",
            },
          ],
          isError: true,
        };
      }

      const ownerId = owner ?? userId;
      const legacyTeamPath = parseTeamOwnerPath(ownerId);

      let canonicalOwner: string;
      if (legacyTeamPath) {
        const organizationId = await resolveOrganizationIdFromLegacyOwnerPath(
          legacyTeamPath.orgSlug,
          legacyTeamPath.teamSegment,
        );
        if (!organizationId) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Organization owner "${ownerId}" not found.`,
              },
            ],
            isError: true,
          };
        }
        canonicalOwner =
          (await getOrganizationCanonicalOwnerRef(organizationId)) ?? ownerId;
        await archiveOrganizationRegistryItem({
          organizationId,
          name,
          requestUserId: userId,
        });
      } else {
        const orgOnly = await resolveOrganizationBySlug(ownerId);
        if (orgOnly) {
          canonicalOwner =
            (await getOrganizationCanonicalOwnerRef(orgOnly.id)) ?? ownerId;
          await archiveOrganizationRegistryItem({
            organizationId: orgOnly.id,
            name,
            requestUserId: userId,
          });
        } else {
          canonicalOwner = (await resolveOwner(ownerId))?.handle ?? ownerId;
          await archiveRegistryItem({
            ownerId,
            name,
            requestUserId: userId,
          });
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Archived component @${canonicalOwner}/${name}. It is now hidden from browse/search but remains directly resolvable for historical references.`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot delete: still referenced")) {
        return {
          content: [{ type: "text" as const, text: msg }],
          isError: true,
        };
      }
      if (msg.includes("not found") || msg.includes("no access")) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Component @${owner ?? "<current>"}/${name} not found or you do not have access.`,
            },
          ],
          isError: true,
        };
      }
      if (msg.includes("Only owner")) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Only the component owner can delete it.",
            },
          ],
          isError: true,
        };
      }
      console.error("[MCP delete_component] error:", msg);
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to delete component: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool(
    "diagnose_publish_readiness",
    {
      title: "Diagnose publish readiness",
      description:
        "Read-only: runs the same validation and optional preview smoke test as `publish_component` without writing to the registry. On failure returns structured JSON with `failureCategory` (VALIDATION_FAILED | PREVIEW_BUILD_FAILED | PREVIEW_RENDER_FAILED), `code`, `step`, and `message` so agents can fix issues without parsing long errors. Recommended flow: call this first with `runPreviewSmoke: true`, then call `publish_component` only when `ok: true`. Default `runPreviewSmoke` is false (fast); set true to match the full publish preview gate. Requires Bearer token.",
      inputSchema: z.object({
        name: z.string().describe("Kebab-case name (used for preview smoke paths)."),
        type: z
          .enum([
            REGISTRY_BLOCK_TYPE,
            REGISTRY_UI_TYPE,
            REGISTRY_THEME_TYPE,
            LEGACY_REGISTRY_COMPONENT_TYPE,
          ])
          .describe("Same as publish_component."),
        content: z.string().optional().describe("Single-file TSX/CSS or theme source."),
        code: z.string().optional().describe("Alias for content."),
        files: z
          .record(z.string(), z.string())
          .optional()
          .describe("Multi-file bundle; same as publish_component."),
        dependencies: z
          .unknown()
          .optional()
          .describe(
            "Optional explicit third-party dependency declarations, for example [{\"name\":\"lucide-react\",\"version\":\"0.511.0\"}]. Missing versions are allowed but force runtime-only compatibility mode.",
          ),
        registryDependencies: z.unknown().optional(),
        previewProps: z.unknown().optional(),
        previewExport: z.string().optional(),
        provenance: z.unknown().optional(),
        provenancePolicy: z.enum(["strict", "split", "inlineVendor"]).optional(),
        applyStubInference: z.boolean().optional(),
        runPreviewSmoke: z
          .boolean()
          .optional()
          .describe(
            "When true, runs preview build/render smoke (slower; matches publish). Default false.",
          ),
      }),
      annotations: MCP_ANN.readClosed,
    },
    async (args) => {
      const ctx = request ? await getAuthContextFromToken(request) : null;
      const userId = ctx?.userId ?? null;
      if (!userId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Authentication required. Add Authorization: Bearer <token>.",
            },
          ],
          isError: true,
        };
      }

      const type = normalizeRegistryItemType(args.type);
      const result = await diagnosePublishReadiness({
        name: args.name,
        type,
        content: args.content,
        code: args.code,
        files: args.files,
        input: {
          dependencies: args.dependencies,
          registryDependencies: args.registryDependencies,
          previewProps: args.previewProps,
          previewExport: args.previewExport,
          provenance: args.provenance,
          provenancePolicy: args.provenancePolicy,
          applyStubInference: args.applyStubInference,
        },
        requestUserId: userId,
        runPreviewSmoke: args.runPreviewSmoke,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      };
    },
  );

  server.registerTool("publish_component", {
    title: "Publish or update component",
    description:
      "Publish or update a design-layer UI component or theme in the registry. Components are distributed as shadcn-style source (not npm packages) and must not depend on app-specific logic (no '@/lib/*', '@/hooks/*', API calls, auth, wallets, etc.). Use type registry:theme to publish a CSS theme (design tokens); content must be CSS (e.g. :root { --color-primary: ... }). If the current user already owns an item with the same name, this creates a NEW VERSION. Requires: name (kebab-case), type (registry:block, registry:ui, or registry:theme), title, and content (TSX for block/UI, CSS for theme). registry:component is accepted as a legacy alias. Requires Bearer token. New components default to private visibility unless `visibility` is explicitly set to public.\n\nRecommended before publish: call `diagnose_publish_readiness` with `runPreviewSmoke: true` and only proceed when it returns `ok: true`. `publish_component` runs the same smoke gate for non-theme items and blocks on PREVIEW_BUILD_FAILED / PREVIEW_RENDER_FAILED.\n\nRegistry project: Optional `project` (registry project slug from `list_projects` or `create_project`). When set, after a successful publish or version bump the component is linked to that project if you have edit access and the item owner matches the project scope (personal item → personal project; org item → org project in the same organization). Omit if you only need to publish without linking.\n\nMulti-file bundles: If your entry file imports local files (e.g. import \"./button\" or \"../utils\"), you MUST submit a multi-file bundle via the `files` field. Provide `files` as a map of {\"index.tsx\": \"...\", \"button.tsx\": \"...\", ...}. All relative imports must be included in `files`, otherwise publish will fail.\n\nRegistry dependencies (`registryDependencies`): Optional refs `@owner/name` or `@owner/name@version`. MUST be explicit—the system does not auto-link to other registry items (registry-dependency-management-spec §1.1). Use `list_components` and read-only `suggest_registry_dependencies` to discover candidates, then set refs in this payload. Successful responses may append informational dependency health (e.g. outdated vs latest); it does not block publish (§3.7).\n\nPreview props (`previewProps`): Optional. The registry preview still works without it (sensible defaults). Provide `previewProps` when you want designers and reviewers to see representative component states in the browser—variants, labels, disabled/open, sample content—without reading source. Stored in meta.previewProps for the /preview page.",
    annotations: MCP_ANN.writeRegistry,
    inputSchema: z.object({
      name: z
        .string()
        .describe("Component name in kebab-case, e.g. my-hero-section"),
      type: z
        .enum([
          REGISTRY_BLOCK_TYPE,
          REGISTRY_UI_TYPE,
          REGISTRY_THEME_TYPE,
          LEGACY_REGISTRY_COMPONENT_TYPE,
        ])
        .describe(
          "registry:block for modules, registry:ui for reusable UI components, registry:theme for CSS theme/tokens. registry:component is accepted as a legacy alias.",
        ),
      title: z.string().describe("Display title, e.g. Hero Section"),
      description: z
        .string()
        .optional()
        .describe("Optional description of the component"),
      previewProps: z
        .any()
        .optional()
        .describe(
          "Optional JSON-serializable props for the registry preview page. Omitted: preview still renders with defaults. Prefer setting when the component has meaningful props so designers can review multiple states (variants, content, flags) in the browser. Stored in meta.previewProps.",
        ),
      previewExport: z
        .string()
        .optional()
        .describe(
          "Optional named export to render in preview (meta.previewExport), e.g. GateButton when there is no default export. Overrides default export when set.",
        ),
      previewStories: z
        .any()
        .optional()
        .describe(
          "Optional preview stories stored in meta.previewStories. Usually an array of { id, title, export?, props? }.",
        ),
      previewDefaultStoryId: z
        .string()
        .optional()
        .describe(
          "Optional default story id stored in meta.previewDefaultStoryId.",
        ),
      /**
       * 单文件模式：入口 TSX/CSS 源码（向后兼容）。
       * 当 files 存在时会被忽略。
       */
      content: z
        .string()
        .optional()
        .describe("Full TSX/React source (block/component) or CSS (theme)"),
      code: z
        .string()
        .optional()
        .describe("Alternative to content: TSX or CSS source"),
      /**
       * 多文件 bundle。键为相对路径（如 index.tsx、Button.tsx、styles.css）。
       * 若提供，则优先于 content/code。
       */
      files: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Optional multi-file bundle. Keys are relative paths (e.g. index.tsx, Button.tsx, styles.css). When provided, this is used instead of content/code.",
        ),
      visibility: z
        .enum(["public", "private"])
        .optional()
        .describe(
          "Visibility for new components: defaults to private when omitted; set to public to make the component visible to everyone. Private components are only visible to the owner (Bearer token).",
        ),
      bump: z
        .enum(["patch", "minor", "major"])
        .optional()
        .describe(
          "When updating an existing component, how to bump the version. Defaults to patch.",
        ),
      publishScope: z
        .enum(["personal", "organization", "team"])
        .optional()
        .describe(
          "Publish target. Defaults to personal. Use `organization` (or legacy `team`) to publish under an org workspace. Prefer `targetRef` like `@org-slug`.",
        ),
      targetRef: z
        .string()
        .optional()
        .describe(
          "Readable organization publish target, for example `@acme`. Use `list_publish_targets` to discover valid values.",
        ),
      organizationSlug: z
        .string()
        .optional()
        .describe(
          "Optional organization slug when publishing to an organization (alternative to `targetRef`).",
        ),
      teamSlug: z
        .string()
        .optional()
        .describe("Ignored (legacy). Use `organizationSlug` or `targetRef`."),
      teamId: z
        .string()
        .optional()
        .describe("Ignored (legacy Better Auth team id). Use `targetRef` / `organizationSlug`."),
      project: z
        .string()
        .optional()
        .describe(
          "Optional registry project slug (from `create_project` or `list_projects`). After publish, links this component to that project when scopes match and you can edit the project.",
        ),
      collection: z
        .string()
        .optional()
        .describe("Legacy parameter name only — same as `project`. Prefer `project`."),
      registryDependencies: z
        .unknown()
        .optional()
        .describe(
          "Optional explicit refs, e.g. [\"@owner/theme\", \"@owner/button@1.0.0\"]. Not auto-filled; use list_components / suggest_registry_dependencies to choose. Omit on version update to inherit previous.",
        ),
      dependencies: z
        .unknown()
        .optional()
        .describe(
          "Optional explicit third-party dependency declarations, for example [{\"name\":\"lucide-react\",\"version\":\"0.511.0\"}]. Missing versions are allowed but force runtime-only compatibility mode.",
        ),
      provenance: z
        .unknown()
        .optional()
        .describe(
          "Optional provenance manifest to de-vendor expanded dependency files into registryDependencies. `contentHash` is optional; when omitted/unknown, strict mode skips dirty detection.",
        ),
      provenancePolicy: z
        .enum(["strict", "split", "inlineVendor"])
        .optional()
        .describe("Provenance enforcement policy. Defaults to strict."),
      applyStubInference: z
        .boolean()
        .optional()
        .describe(
          "When true, merge Cozy stub-inferred registry refs into persisted registryDependencies. Default false: stub hints appear in tool/diagnostics only.",
        ),
    }),
  }, async (args) => {
    const files =
      args.files && Object.keys(args.files).length > 0 ? args.files : undefined;
    const content = files ? undefined : args.content ?? args.code;
    if (!files && !content) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "Missing required field: files or content/code (TSX or CSS for theme).",
          },
        ],
        isError: true,
      };
    }
    // Log raw input for debugging Figma Make request format (Vercel Logs)
    console.log(
      "[MCP publish_component] raw args:",
      JSON.stringify({
        ...args,
        hasFiles: !!files,
        fileCount: files ? Object.keys(files).length : 0,
        contentLength: content?.length ?? 0,
      }),
    );

    try {
      const { name, title, description, visibility, bump } = args;
      const projectLinkSlug =
        typeof args.project === "string" && args.project.trim()
          ? args.project
          : typeof args.collection === "string" && args.collection.trim()
            ? args.collection
            : undefined;
      const type = normalizeRegistryItemType(args.type);
      const isTheme = type === REGISTRY_THEME_TYPE;

      const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!nameRegex.test(name)) {
        return {
          content: [{ type: "text" as const, text: `Invalid name: must be kebab-case (e.g. my-component)` }],
          isError: true,
        };
      }

      // 入口校验 + 本地依赖校验：
      // - 单文件：若出现相对 import（./ ../），强制要求改用 files 方式提交
      // - 多文件：校验所有相对 import 都能在 files 中解析到对应文件，否则报缺失列表
      // - 同时检查是否包含 app hooks / Provider（如 useLanguage / LanguageProvider），若有则拒绝发布
      if (content) {
        if (!isTheme) {
          const validation = validateTsx(content);
          if (!validation.valid) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid TSX: ${validation.error}`,
                },
              ],
              isError: true,
            };
          }
        } else if (looksLikeComponentSource(content)) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Type/content mismatch: received component-like source while type is registry:theme. Use type registry:ui or registry:block for TSX/JSX components, or provide CSS / tokens JSON for registry:theme.",
              },
            ],
            isError: true,
          };
        } else if (content.trim().length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Theme content is required (either CSS or tokens JSON).",
              },
            ],
            isError: true,
          };
        }
        const rel = extractDependencies(content).filter((d) => isRelativeImport(d));
        if (rel.length > 0 && type !== REGISTRY_THEME_TYPE) {
          const list = rel.slice(0, 12).map((x) => `- ${x}`).join("\n");
          const more = rel.length > 12 ? `\n- ... and ${rel.length - 12} more` : "";
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "This component imports local files, but only a single entry file was provided. Please re-submit using the `files` field (multi-file bundle).\n\nDetected relative imports:\n" +
                  list +
                  more +
                  "\n\nExpected format:\nfiles: {\"index.tsx\": \"<entry>\", \"button.tsx\": \"<imported>\", ...}",
              },
            ],
            isError: true,
          };
        }

        const appUsages = findAppSpecificUsage([content]);
        if (appUsages.length > 0) {
          const list = appUsages.slice(0, 10).map((u) => `- ${u}`).join("\n");
          const more =
            appUsages.length > 10
              ? `\n- ... and ${appUsages.length - 10} more`
              : "";
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "This component uses app-specific hooks/providers (e.g. i18n, auth, routing). Registry components must be pure UI and receive data via props.\n\nDetected app-specific usage:\n" +
                  list +
                  more +
                  "\n\nPlease:\n" +
                  "1. Keep your existing container component inside your app that uses these hooks/providers.\n" +
                  "2. Extract a presentational component that only depends on props (texts, callbacks, flags).\n" +
                  "3. Publish that presentational component instead (no app hooks or Providers inside).",
              },
            ],
            isError: true,
          };
        }
      }

      if (files) {
        if (!isTheme) {
          // If provenance is present, normalize bundle first so missing local imports
          // (e.g. ./Button) can be satisfied by synthesized stubs before validation.
          const normalizedForValidation = (() => {
            const contract = normalizePublishContract({
              // At this stage we haven't determined create vs update yet; stubs are
              // only needed to satisfy local import validation, so "create" is fine.
              mode: "create",
              input: args as {
                registryDependencies?: unknown;
                previewProps?: unknown;
                previewExport?: unknown;
                provenance?: unknown;
                provenancePolicy?: unknown;
                applyStubInference?: unknown;
              },
              files,
            });
            return contract.ok && contract.value.filesToWrite
              ? contract.value.filesToWrite
              : files;
          })();

          const bundleValidation = validateComponentBundle(normalizedForValidation);
          if (bundleValidation.invalidFiles?.length) {
            const list = bundleValidation.invalidFiles
              .slice(0, 20)
              .map((x) => `- ${x}`)
              .join("\n");
            const more =
              bundleValidation.invalidFiles.length > 20
                ? `\n- ... and ${bundleValidation.invalidFiles.length - 20} more`
                : "";
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    "Multi-file bundle contains invalid code files. Please fix these files before publishing:\n" +
                    list +
                    more,
                },
              ],
              isError: true,
            };
          }

          const missing =
            bundleValidation.missingImports ??
            findMissingRelativeImports(normalizedForValidation);
          if (missing.length > 0) {
            const list = missing.slice(0, 20).map((x) => `- ${x}`).join("\n");
            const more = missing.length > 20 ? `\n- ... and ${missing.length - 20} more` : "";
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    "Multi-file bundle is missing local import targets. Please include these files in `files` (paths must match relative imports):\n" +
                    list +
                    more,
                },
              ],
              isError: true,
            };
          }
        } else {
          const hasThemePayload = Object.values(files).some(
            (value) => typeof value === "string" && value.trim().length > 0,
          );
          if (!hasThemePayload) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Theme files must include CSS or tokens JSON content.",
                },
              ],
              isError: true,
            };
          }
          const componentLikeThemeFiles = Object.entries(files)
            .filter(([filePath, value]) => {
              if (typeof value !== "string") return false;
              if (/\.(tsx?|jsx?)$/i.test(filePath)) return true;
              return looksLikeComponentSource(value);
            })
            .map(([filePath]) => filePath)
            .slice(0, 10);
          if (componentLikeThemeFiles.length > 0) {
            const list = componentLikeThemeFiles.map((x) => `- ${x}`).join("\n");
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    "Type/files mismatch: registry:theme payload contains component-like code files.\n\nDetected files:\n" +
                    list +
                    "\n\nUse type registry:ui or registry:block for component bundles, or submit only CSS/tokens JSON for registry:theme.",
                },
              ],
              isError: true,
            };
          }
        }

        const appUsages = findAppSpecificUsage(
          Object.values(files).filter(
            (v): v is string => typeof v === "string",
          ),
        );
        if (appUsages.length > 0) {
          const list = appUsages.slice(0, 10).map((u) => `- ${u}`).join("\n");
          const more =
            appUsages.length > 10
              ? `\n- ... and ${appUsages.length - 10} more`
              : "";
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "This component bundle uses app-specific hooks/providers (e.g. i18n, auth, routing). Registry components must be pure UI and receive data via props.\n\nDetected app-specific usage:\n" +
                  list +
                  more +
                  "\n\nPlease:\n" +
                  "1. Wrap these hooks/providers in your own container component inside your app.\n" +
                  "2. Export a presentational component that only depends on props (texts, callbacks, flags).\n" +
                  "3. Publish that presentational component instead (no app hooks or Providers inside).",
              },
            ],
            isError: true,
          };
        }
      }

      const ctx = request ? await getAuthContextFromToken(request) : null;
      const userId = ctx?.userId ?? null;
      if (!userId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Authentication required. Add Authorization: Bearer <your-token> in Figma Make Connector settings (Additional headers). Create a token at /settings.",
            },
          ],
          isError: true,
        };
      }

      const wantsOrganization =
        args.publishScope === "team" ||
        args.publishScope === "organization" ||
        (typeof args.targetRef === "string" && args.targetRef.trim().length > 0) ||
        (typeof args.organizationSlug === "string" && args.organizationSlug.trim().length > 0);

      const publishScope = wantsOrganization ? "organization" : "personal";

      const resolvedPublishTarget = await resolvePublishTargetForUser({
        userId,
        publishScope,
        targetRef: typeof args.targetRef === "string" ? args.targetRef : null,
        organizationSlug:
          typeof args.organizationSlug === "string" ? args.organizationSlug : null,
      });
      if (!resolvedPublishTarget.ok) {
        const text =
          resolvedPublishTarget.code === "AMBIGUOUS_ORG_TARGET"
            ? `${resolvedPublishTarget.message} Call \`list_publish_targets\` and choose one explicitly using \`targetRef\`, for example \`@acme\`.`
            : resolvedPublishTarget.message;
        return {
          content: [
            {
              type: "text" as const,
              text,
            },
          ],
          isError: true,
        };
      }
      const orgTarget =
        resolvedPublishTarget.target.kind === "organization"
          ? resolvedPublishTarget.target
          : null;
      const canonicalProjectForLink = projectLinkSlug
        ? await resolveCanonicalRegistryProjectForWrite({
            userId,
            projectSlug: projectLinkSlug,
            ownerUserId: orgTarget ? null : userId,
            organizationId: orgTarget?.id ?? null,
          })
        : { ok: true as const, project: null };
      if (!canonicalProjectForLink.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: canonicalProjectForLink.error,
            },
          ],
          isError: true,
        };
      }

      // 归一化 theme：若 type === registry:theme，优先将 content / files 中的 JSON 视为 tokens.json，
      // 并从中派生 theme.css。
      const normalizedTheme = normalizePublishThemeArgs(args);

      // Project-first uniqueness:
      // - When project slug is provided, only update an item already linked to that project.
      // - Otherwise keep legacy owner/name behavior.
      const existing = await (async () => {
        if (!canonicalProjectForLink.project) {
          return orgTarget
            ? getRegistryItemByOrganizationAndName(orgTarget.id, name).catch(() => null)
            : getRegistryItemByOwnerNameAndVersion(
                userId,
                name,
                null,
                userId,
              ).catch(() => null);
        }
        const scoped = await findRegistryItemLinkedToProjectByName({
          project: canonicalProjectForLink.project,
          name,
        });
        if (!scoped.ok) {
          throw new Error(scoped.error);
        }
        return scoped.item;
      })();

      if (existing) {
        const normalizedDeclaredDependencies = normalizeThirdPartyDependenciesInput(
          args.dependencies,
        );
        if (normalizedDeclaredDependencies.error) {
          return {
            content: [{ type: "text" as const, text: normalizedDeclaredDependencies.error }],
            isError: true,
          };
        }
        const contract = normalizePublishContract({
          mode: "version",
          input: args as {
            registryDependencies?: unknown;
            previewProps?: unknown;
            previewExport?: unknown;
            provenance?: unknown;
            provenancePolicy?: unknown;
            applyStubInference?: unknown;
          },
          files: (normalizedTheme.files ?? files) as Record<string, string> | undefined,
          previousRegistryDependencies: (existing.registryDependencies ?? []) as string[],
        });
        if (!contract.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: contract.code
                  ? `[${contract.code}] ${contract.error}`
                  : contract.error,
              },
            ],
            isError: true,
          };
        }
        const bumpType = bump ?? "patch";
        const nextFiles = contract.value.filesToWrite ?? (normalizedTheme.files ?? files);
        const nextRegistryDependencies =
          contract.value.registryDependenciesToWrite ??
          ((existing.registryDependencies ?? []) as string[]);
        const dependencies = (() => {
          const allDeps = new Set<string>();
          const addDepsFromSource = (src: string | undefined | null) => {
            if (!src) return;
            for (const dep of extractDependencies(src)) {
              if (isBarePackageSpecifier(dep)) allDeps.add(dep);
            }
          };

          if (nextFiles) {
            for (const source of Object.values(nextFiles)) {
              if (typeof source !== "string") continue;
              addDepsFromSource(source);
            }
          } else {
            addDepsFromSource(content ?? undefined);
          }

          return Array.from(allDeps).sort();
        })();
        const dependencyDecisions = evaluateThirdPartyDependencies({
          discovered: excludeExplicitRegistryDependencies(
            dependencies,
            nextRegistryDependencies,
          ),
          declared: normalizedDeclaredDependencies.value,
        });
        const rejectedDependencies = getRejectedDependencyDecisions(
          dependencyDecisions,
        );
        if (rejectedDependencies.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Unsupported third-party dependencies: " +
                  rejectedDependencies
                    .map((decision) => `${decision.packageName} (${decision.message})`)
                    .join(", "),
              },
            ],
            isError: true,
          };
        }
        if (!isTheme) {
          const smoke = await runRegistryPreviewSmokeTest({
            name,
            files: nextFiles,
            content: nextFiles ? null : content ?? undefined,
            previewProps: contract.value.previewProps,
            previewExport: contract.value.previewExport,
            registryDependencies: nextRegistryDependencies,
            dependencyDecisions,
            requestUserId: userId,
          });
          if (!smoke.ok) {
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `[${smoke.code}] ${smoke.message}` +
                    (smoke.stack ? `\n\n${smoke.stack}` : ""),
                },
              ],
              isError: true,
            };
          }
          const previewDependencyResolutionDiagnostics =
            smoke.dependencyResolutionDiagnostics ?? [];
          const result = await createRegistryItemVersion({
            ownerId: orgTarget ? undefined : userId,
            organizationId: orgTarget?.id,
            name,
            content: normalizedTheme.content ?? (files ? content ?? undefined : undefined),
            files: nextFiles,
            bump: bumpType,
            userId,
            message: description || undefined,
            dependencies,
            declaredDependencies: normalizedDeclaredDependencies.value,
            dependencyDecisions,
            previewProps: contract.value.previewProps,
            previewExport: contract.value.previewExport,
            previewStories: args.previewStories,
            previewDefaultStoryId: args.previewDefaultStoryId,
            registryDependencies: contract.value.registryDependenciesToWrite,
          });
          const defaultStoryIdForVersion =
            (typeof args.previewDefaultStoryId === "string" &&
            args.previewDefaultStoryId.trim().length > 0
              ? args.previewDefaultStoryId.trim()
              : null) ?? getPreviewDefaultStoryIdFromMeta(existing.meta);

          const effectiveRegistryDeps =
            contract.value.registryDependenciesToWrite ??
            ((existing.registryDependencies ?? []) as string[]);
          let healthSuffix = "";
          if (effectiveRegistryDeps.length > 0) {
            const health = await computeRegistryDependencyHealth(
              effectiveRegistryDeps,
              userId,
            );
            healthSuffix = formatDependencyHealthForMcp(health);
          }
          const orgRef =
            orgTarget?.targetRef ??
            (existing.organizationId
              ? existing.organizationId
              : userId ?? "me");
          const previewStatusNote = `\n\nPreview artifact status: queued\nCheck: /api/registry/preview-artifacts/status?owner=${encodeURIComponent(
            orgRef,
          )}&name=${encodeURIComponent(name)}&v=${encodeURIComponent(
            result.version,
          )}${defaultStoryIdForVersion ? `&story=${encodeURIComponent(defaultStoryIdForVersion)}` : ""}`;
          const dependencyResolutionNote =
            previewDependencyResolutionDiagnostics.length > 0
              ? `\n\nPreview dependency resolution:\n${JSON.stringify(
                  previewDependencyResolutionDiagnostics,
                  null,
                  2,
                )}`
              : "";
          const baseText =
            `Published @${orgRef}/${name}@${result.version} (private=${String(
              visibility !== "public",
            )}).` +
            healthSuffix;
          return {
            content: [
              {
                type: "text" as const,
                text: `${baseText}${previewStatusNote}${dependencyResolutionNote}`,
              },
            ],
          };
        }
        const result = await createRegistryItemVersion({
          ownerId: orgTarget ? undefined : userId,
          organizationId: orgTarget?.id,
          name,
          content: normalizedTheme.content ?? (files ? content ?? undefined : undefined),
          files: nextFiles,
          bump: bumpType,
          userId,
          message: description || undefined,
          dependencies,
          declaredDependencies: normalizedDeclaredDependencies.value,
          dependencyDecisions,
          previewProps: contract.value.previewProps,
          previewExport: contract.value.previewExport,
          previewStories: args.previewStories,
          previewDefaultStoryId: args.previewDefaultStoryId,
          registryDependencies: contract.value.registryDependenciesToWrite,
        });
        const defaultStoryIdForVersion =
          (typeof args.previewDefaultStoryId === "string" &&
          args.previewDefaultStoryId.trim().length > 0
            ? args.previewDefaultStoryId.trim()
            : null) ?? getPreviewDefaultStoryIdFromMeta(existing.meta);

        const effectiveRegistryDeps =
          contract.value.registryDependenciesToWrite ??
          ((existing.registryDependencies ?? []) as string[]);
        let healthSuffix = "";
        if (effectiveRegistryDeps.length > 0) {
          const health = await computeRegistryDependencyHealth(
            effectiveRegistryDeps,
            userId,
          );
          healthSuffix = formatDependencyHealthForMcp(health);
        }
        const orgRef =
          orgTarget?.targetRef
            ? orgTarget.targetRef.slice(1)
            : orgTarget != null
              ? (await getOrganizationCanonicalOwnerRef(orgTarget.id)) ?? orgTarget.slug
              : null;
        const baseText = orgTarget
          ? `Updated organization component "${existing.title}" (@${orgRef}/${existing.name}) to v${result.version}.${healthSuffix}`
          : `Updated "${existing.title}" (@${(await resolveOwner(existing.userId ?? userId))?.handle ?? existing.userId ?? "legacy"}/${existing.name}) to version v${result.version}. View at /registry/${(await resolveOwner(existing.userId ?? userId))?.handle ?? existing.userId ?? "legacy"}/${existing.name}${healthSuffix}`;

        await enqueuePreviewArtifactJob({
          itemId: existing.id,
          itemVersionId: result.id,
          payload: {
            owner: orgRef ?? ((await resolveOwner(existing.userId ?? userId))?.handle ?? "legacy"),
            project: existing.canonicalProjectKey ?? canonicalProjectForLink.project?.namespaceKey ?? null,
            name: existing.name,
            version: result.version,
            mode: "default",
            storyId: defaultStoryIdForVersion,
            requestUserId: userId,
          },
        });

        const previewStatusNote = `\n\nPreview artifact status: queued\nCheck: /api/registry/preview-artifacts/status?owner=${encodeURIComponent(
          orgRef ?? ((await resolveOwner(existing.userId ?? userId))?.handle ?? "legacy"),
        )}&name=${encodeURIComponent(existing.name)}&v=${encodeURIComponent(result.version)}${
          defaultStoryIdForVersion
            ? `&story=${encodeURIComponent(defaultStoryIdForVersion)}`
            : ""
        }`;

        if (canonicalProjectForLink.project) {
          const attach = await attachPublishedItemToProject(
            userId,
            canonicalProjectForLink.project,
            existing.id,
          );
          if (!attach.ok) {
            return {
              content: [{ type: "text" as const, text: `${baseText}${previewStatusNote}\n\n${attach.error}` }],
              isError: true,
            };
          }
          const note = attach.note ? `\n\n${attach.note}` : "";
          return {
            content: [{ type: "text" as const, text: `${baseText}${previewStatusNote}${note}` }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `${baseText}${previewStatusNote}` }],
        };
      }

      // 否则创建一个全新的组件（初始版本会在 createRegistryItem 中一并写入）
      // 仅保留裸模块依赖（npm 包），忽略相对路径 import
      const dependencies = (() => {
        const allDeps = new Set<string>();

        const addDepsFromSource = (src: string | undefined | null) => {
          if (!src) return;
          for (const dep of extractDependencies(src)) {
            if (isBarePackageSpecifier(dep)) allDeps.add(dep);
          }
        };

        if (normalizedTheme.files ?? files) {
          const srcFiles = (normalizedTheme.files ?? files) as Record<string, string>;
          for (const source of Object.values(srcFiles)) {
            if (typeof source !== "string") continue;
            addDepsFromSource(source);
          }
        } else if (normalizedTheme.content ?? content) {
          addDepsFromSource(normalizedTheme.content ?? content);
        }

        return Array.from(allDeps).sort();
      })();
      const normalizedDeclaredDependencies = normalizeThirdPartyDependenciesInput(
        args.dependencies,
      );
      if (normalizedDeclaredDependencies.error) {
        return {
          content: [{ type: "text" as const, text: normalizedDeclaredDependencies.error }],
          isError: true,
        };
      }
      const normalizedRegistryDependencies = normalizeRegistryDependenciesInput(
        args.registryDependencies,
      );
      const dependencyDecisions = evaluateThirdPartyDependencies({
        discovered: excludeExplicitRegistryDependencies(
          dependencies,
          normalizedRegistryDependencies.value,
        ),
        declared: normalizedDeclaredDependencies.value,
      });
      const rejectedDependencies = getRejectedDependencyDecisions(
        dependencyDecisions,
      );
      if (rejectedDependencies.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "Unsupported third-party dependencies: " +
                rejectedDependencies
                  .map((decision) => `${decision.packageName} (${decision.message})`)
                  .join(", "),
            },
          ],
          isError: true,
        };
      }
      const contract = normalizePublishContract({
        mode: "create",
        input: args as {
          registryDependencies?: unknown;
          previewProps?: unknown;
          previewExport?: unknown;
          provenance?: unknown;
          provenancePolicy?: unknown;
          applyStubInference?: unknown;
        },
        files: (normalizedTheme.files ?? files) as Record<string, string> | undefined,
      });
      if (!contract.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: contract.code
                ? `[${contract.code}] ${contract.error}`
                : contract.error,
            },
          ],
          isError: true,
        };
      }
      const nextFiles = contract.value.filesToWrite ?? (normalizedTheme.files ?? files);
      const nextRegistryDependencies =
        contract.value.registryDependenciesToWrite ?? [];
      if (!isTheme) {
        const smoke = await runRegistryPreviewSmokeTest({
          name,
          files: nextFiles,
          content: nextFiles ? null : normalizedTheme.content ?? content ?? undefined,
          previewProps: contract.value.previewProps,
          previewExport: contract.value.previewExport,
          registryDependencies: nextRegistryDependencies,
          dependencyDecisions,
          requestUserId: userId,
        });
        if (!smoke.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `[${smoke.code}] ${smoke.message}` +
                  (smoke.stack ? `\n\n${smoke.stack}` : ""),
              },
            ],
            isError: true,
          };
        }
      }
      const item = await createRegistryItem({
        name,
        type,
        title,
        description: description || null,
        content: normalizedTheme.content ?? (files ? content ?? undefined : undefined),
        files: nextFiles,
        userId: orgTarget ? null : userId,
        organizationId: orgTarget?.id ?? null,
        visibility: visibility === "public" ? "public" : "private",
        dependencies,
        declaredDependencies: normalizedDeclaredDependencies.value,
        dependencyDecisions,
        registryDependencies: nextRegistryDependencies,
        previewProps: contract.value.previewProps,
        previewExport: contract.value.previewExport,
        previewStories: args.previewStories,
        previewDefaultStoryId: args.previewDefaultStoryId,
        requestUserId: userId,
      });

      const effectiveRegistryDepsCreate =
        contract.value.registryDependenciesToWrite ?? [];
      let healthSuffixCreate = "";
      if (effectiveRegistryDepsCreate.length > 0) {
        const health = await computeRegistryDependencyHealth(
          effectiveRegistryDepsCreate,
          userId,
        );
        healthSuffixCreate = formatDependencyHealthForMcp(health);
      }
      const orgRefCreate =
        orgTarget?.targetRef
          ? orgTarget.targetRef.slice(1)
          : orgTarget != null
            ? (await getOrganizationCanonicalOwnerRef(orgTarget.id)) ?? orgTarget.slug
            : null;
      const baseTextCreate = orgTarget
        ? `Published new organization component "${item.title}" (@${orgRefCreate}/${item.name}).${healthSuffixCreate}`
        : `Published new component "${item.title}" (@${(await resolveOwner(item.userId ?? "legacy"))?.handle ?? item.userId ?? "legacy"}/${item.name}). View at /registry/${(await resolveOwner(item.userId ?? "legacy"))?.handle ?? item.userId ?? "legacy"}/${item.name}${healthSuffixCreate}`;

      const createOwner =
        orgRefCreate ??
        ((await resolveOwner(item.userId ?? "legacy"))?.handle ??
          item.userId ??
          "legacy");
      const initialVersionId =
        "initialVersionId" in item && typeof item.initialVersionId === "string"
          ? item.initialVersionId
          : null;
      if (initialVersionId) {
        const defaultStoryIdForCreate =
          typeof args.previewDefaultStoryId === "string" &&
          args.previewDefaultStoryId.trim().length > 0
            ? args.previewDefaultStoryId.trim()
            : null;
        await enqueuePreviewArtifactJob({
          itemId: item.id,
          itemVersionId: initialVersionId,
          payload: {
            owner: createOwner,
            project: item.canonicalProjectKey ?? canonicalProjectForLink.project?.namespaceKey ?? null,
            name: item.name,
            version: item.currentVersion ?? "0.1.0",
            mode: "default",
            storyId: defaultStoryIdForCreate,
            requestUserId: userId,
          },
        });
      }
      const previewStatusNoteCreate = `\n\nPreview artifact status: queued\nCheck: /api/registry/preview-artifacts/status?owner=${encodeURIComponent(
        createOwner,
      )}&name=${encodeURIComponent(item.name)}&v=${encodeURIComponent(item.currentVersion ?? "0.1.0")}${
        typeof args.previewDefaultStoryId === "string" &&
        args.previewDefaultStoryId.trim().length > 0
          ? `&story=${encodeURIComponent(args.previewDefaultStoryId.trim())}`
          : ""
      }`;

      if (canonicalProjectForLink.project) {
        const attach = await attachPublishedItemToProject(
          userId,
          canonicalProjectForLink.project,
          item.id,
        );
        if (!attach.ok) {
          return {
            content: [{ type: "text" as const, text: `${baseTextCreate}${previewStatusNoteCreate}\n\n${attach.error}` }],
            isError: true,
          };
        }
        const note = attach.note ? `\n\n${attach.note}` : "";
        return {
          content: [{ type: "text" as const, text: `${baseTextCreate}${previewStatusNoteCreate}${note}` }],
        };
      }
      return {
        content: [{ type: "text" as const, text: `${baseTextCreate}${previewStatusNoteCreate}` }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 不再对 duplicate name 给出「换名字」提示，因为我们已经在上面处理为版本更新。
      console.error("[MCP publish_component] error:", msg);
      return {
        content: [{ type: "text" as const, text: `Failed to publish: ${msg}` }],
        isError: true,
      };
    }
  });

  return server;
}

function looksLikeComponentSource(source: string): boolean {
  const text = source.trim();
  if (!text) return false;
  if (text.startsWith("{")) return false; // Likely tokens JSON
  const patterns = [
    /\bimport\s+.+\s+from\s+["'][^"']+["']/,
    /\bexport\s+default\s+function\b/,
    /\bexport\s+function\b/,
    /\bconst\s+[A-Z][A-Za-z0-9_]*\s*=\s*\(/,
    /<[A-Za-z][\w:-]*(\s|>)/,
  ];
  return patterns.some((p) => p.test(text));
}
