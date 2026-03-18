import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  getRegistryItemsScoped,
  getRegistryItemByName,
  getRegistryItemByOwnerNameAndVersion,
  getRegistryItemByOwnerNameAndVersionScoped,
  getRegistryItemVersions,
  getCurrentVersion,
  createRegistryItem,
  createRegistryItemVersion,
  deleteRegistryItem,
  toShadcnRegistryItem,
} from "./registry";
import {
  validateTsx,
  extractDependencies,
  findMissingRelativeImports,
  isRelativeImport,
  validateComponentBundle,
} from "./validate-tsx";
import { getAuthContextFromToken } from "./auth-api";
import { resolveOwner } from "./owner";
import { getRegistryPolicyForApiKey } from "./registry-policy";
import { db } from "./db";
import { registryCollections } from "./db/schema";
import { parseTokensFromJson, tokensToRootCss } from "./theme-tokens";
import {
  checkInstalledItemUpdate,
  getProjectRegistryStatus,
  installRegistryBundle,
  readLockfile,
  upgradeInstalledItem,
  type RegistryCoordinate,
} from "./install-protocol";
import { getBaseUrl } from "./oauth";
import type { RegistryPolicy } from "./registry-policy";

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

  async function getCanonicalOwner(owner: string | null | undefined) {
    if (!owner) return "legacy";
    return (await resolveOwner(owner))?.handle ?? owner;
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
    type: string;
    version: string;
    baseUrl?: string | null;
    files?: { path: string }[];
  }) {
    const sourceBase = params.baseUrl ?? "";
    const source = sourceBase
      ? `${sourceBase}/api/r/${params.owner}/${params.name}?v=${params.version}`
      : `/api/r/${params.owner}/${params.name}?v=${params.version}`;
    return {
      version: 1,
      items: {
        [`@${params.owner}/${params.name}`]: {
          type: params.type,
          version: params.version,
          source,
          installedFiles: (params.files ?? []).map(
            (f) => `src/registry/${params.owner}/${params.name}/${f.path}`,
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

  async function getAdhocPolicyForCollectionSlug(collectionSlug: string, requestUserId: string) {
    const [row] = await db
      .select({ id: registryCollections.id })
      .from(registryCollections)
      .where(and(eq(registryCollections.ownerUserId, requestUserId), eq(registryCollections.slug, collectionSlug)))
      .limit(1);
    if (!row?.id) return null;

    const policy: RegistryPolicy = {
      apiKeyId: "__adhoc__",
      ownerUserId: requestUserId,
      allowedCollectionIds: [row.id],
      allowedTypes: [],
      allowedOwnerHandlesOrIds: [],
      allowPublicOutsideCollections: false,
    };
    return policy;
  }

  server.registerTool(
    "list_collections",
    {
      title: "List collections",
      description:
        "List your Collections (slug + title). Use this to decide a scope like 'dashboard-blocks' before listing or fetching components within that collection.",
      inputSchema: z.object({}).describe("No input required"),
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

      const rows = await db
        .select({
          id: registryCollections.id,
          slug: registryCollections.slug,
          title: registryCollections.title,
          visibility: registryCollections.visibility,
        })
        .from(registryCollections)
        .where(eq(registryCollections.ownerUserId, userId))
        .orderBy(registryCollections.slug);

      const lines = rows.map((c) => `- **${c.slug}**: ${c.title} (${c.visibility})`).join("\n");
      return {
        content: [
          {
            type: "text" as const,
            text: rows.length ? `Your collections (${rows.length}):\n\n${lines}` : "You have no collections yet.",
          },
        ],
      };
    },
  );

  server.registerTool("list_components", {
    title: "List components",
    description: "List all components and modules available in the registry. Use this to discover what's available before fetching a specific component. Components are distributed as shadcn-style source bundles (editable TSX), not npm packages. Public components are always listed; private components require Authorization: Bearer <token>.",
    inputSchema: z
      .object({
        collection: z
          .string()
          .optional()
          .describe(
            "Optional collection slug to scope results (e.g. dashboard-blocks). This is an ad-hoc scope for this call (not token policy).",
          ),
      })
      .describe("Optional collection scope"),
  }, async ({ collection }) => {
    const ctx = request ? await getAuthContextFromToken(request) : null;
    const userId = ctx?.userId ?? null;
    const policyFromToken = ctx ? await getRegistryPolicyForApiKey(ctx.apiKeyId) : null;
    const policy =
      collection && userId
        ? await getAdhocPolicyForCollectionSlug(collection, userId)
        : policyFromToken;
    const items = await getRegistryItemsScoped({
      requestUserId: userId,
      policy,
    });
    const summary = items
      .map(
        (i) => {
          const owner = (i as { ownerHandle?: string | null; userId?: string | null }).ownerHandle ?? i.userId ?? "legacy";
          return `- **@${owner}/${i.name}** (${i.type}): ${i.title}${i.description ? ` - ${i.description}` : ""}`;
        }
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Available components (${items.length}):\n\n${summary}`,
        },
      ],
    };
  })


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
            "Owner handle (preferred) or legacy userId (from list_components). Use when multiple components have the same name.",
          ),
      }),
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

        const canonicalOwner = await getCanonicalOwner(
          item.userId ?? owner ?? "legacy",
        );
        const currentVersion = getCurrentVersion(item);
        const latestVersion =
          (await getLatestVersionForItem({
            owner: item.userId ?? "legacy",
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

  // Scoped variant: force the component to be in a specific collection (by slug)
  server.registerTool(
    "get_component_in_collection",
    {
      title: "Get component (scoped to collection)",
      description:
        "Get a specific component, but ONLY if it belongs to the given collection slug. Use this when you want to build a page using only components from a certain collection (e.g. dashboard-blocks).",
      inputSchema: z.object({
        collection: z.string().describe("Collection slug, e.g. dashboard-blocks"),
        name: z.string().describe("Component name, e.g. hero-section, faq"),
        owner: z
          .string()
          .optional()
          .describe("Owner handle (preferred) or legacy userId (from list_components)."),
      }),
    },
    async ({ collection, name, owner }) => {
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

      const adhoc = await getAdhocPolicyForCollectionSlug(collection, userId);
      if (!adhoc) {
        return {
          content: [{ type: "text" as const, text: `Collection "${collection}" not found.` }],
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
              text: `Component "${name}" not found in collection "${collection}" (or not allowed).`,
            },
          ],
          isError: true,
        };
      }

      // Reuse existing get_component rendering by delegating to the same conversion logic
      const canonicalOwner =
        (await resolveOwner(item.userId ?? owner ?? "legacy"))?.handle ??
        item.userId ??
        owner ??
        "legacy";
      const currentVersion = getCurrentVersion(item);
      const latestVersion =
        (await getLatestVersionForItem({
          owner: item.userId ?? "legacy",
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
        `- Scoped to collection: ${collection}`,
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
    },
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
            "Owner userId (e.g. legacy, or from list_components). Required to disambiguate components with the same name.",
          ),
      }),
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

        const resolvedOwner = await resolveOwner(owner);
        if (!resolvedOwner) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Component owner "${owner}" not found.`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = resolvedOwner.handle ?? owner;
        const versions = await getRegistryItemVersions(
          resolvedOwner.userId,
          name,
          userId,
        );
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

        const canonicalOwner = await getCanonicalOwner(item.userId ?? owner);
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
    "install_component_bundle",
    {
      title: "Install component bundle",
      description:
        "Install a registry block/component bundle into a local project, write files under the default install path, and update cozy-registry.lock.json. Use this instead of manually copying files when you need Cozy install tracking. This requires a projectRoot that is writable by the MCP runtime.",
      inputSchema: z.object({
        projectRoot: z
          .string()
          .describe("Absolute path to the target project root where files should be installed."),
        name: z.string().describe("Component name in kebab-case, e.g. hero-section"),
        owner: z
          .string()
          .describe("Owner handle (preferred) or legacy userId."),
        version: z
          .string()
          .optional()
          .describe("Optional target version. Defaults to the current latest version."),
      }),
    },
    async ({ projectRoot, name, owner, version }) => {
      try {
        const { userId, policy } = await getScopedToolContext();
        const item = await getRegistryItemByOwnerNameAndVersionScoped({
          ownerId: owner,
          name,
          version: version ?? null,
          requestUserId: userId,
          policy,
        });

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Component @${owner}/${name}${version ? `@${version}` : ""} not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalOwner(item.userId ?? owner);
        const selectedVersion = version?.trim() || getCurrentVersion(item);
        const shadcnItem = toShadcnRegistryItem(item);
        const coordinate = `@${canonicalOwner}/${item.name}` as RegistryCoordinate;
        const source = `${getBaseUrl()}/api/r/${canonicalOwner}/${item.name}?v=${selectedVersion}`;
        const result = await installRegistryBundle({
          projectRoot,
          coordinate,
          type: item.type,
          version: selectedVersion,
          source,
          files: shadcnItem?.files ?? [],
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
          .describe("Installed coordinate to upgrade, e.g. @acme/hero-section."),
        toVersion: z
          .string()
          .optional()
          .describe("Optional explicit target version. Defaults to latest."),
        force: z
          .boolean()
          .optional()
          .describe("Whether to overwrite locally modified files when conflicts are detected."),
      }),
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
          .describe("Owner handle (preferred) or legacy userId."),
        version: z
          .string()
          .optional()
          .describe("Optional target version. Defaults to the current latest version."),
      }),
    },
    async ({ name, owner, version }) => {
      try {
        const { userId, policy } = await getScopedToolContext();
        const item = await getRegistryItemByOwnerNameAndVersionScoped({
          ownerId: owner,
          name,
          version: version ?? null,
          requestUserId: userId,
          policy,
        });

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Component @${owner}/${name}${version ? `@${version}` : ""} not found (or not allowed by your token scope).`,
              },
            ],
            isError: true,
          };
        }

        const canonicalOwner = await getCanonicalOwner(item.userId ?? owner);
        const selectedVersion = version?.trim() || getCurrentVersion(item);
        const shadcnItem = toShadcnRegistryItem(item);
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
        const payload = {
          ok: true,
          item: {
            coordinate: `@${canonicalOwner}/${item.name}`,
            type: item.type,
            version: selectedVersion,
            source: baseUrl
              ? `${baseUrl}/api/r/${canonicalOwner}/${item.name}?v=${selectedVersion}`
              : `/api/r/${canonicalOwner}/${item.name}?v=${selectedVersion}`,
            files: shadcnItem?.files ?? [],
          },
          lockfileEntry: buildLockfileEntry({
            owner: canonicalOwner,
            name: item.name,
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

  function normalizeThemeArgs(args: {
    type: string;
    files?: Record<string, string> | null;
    content?: string;
    code?: string;
  }): { files?: Record<string, string>; content?: string | undefined } {
    if (args.type !== "registry:theme") {
      return { files: args.files as Record<string, string> | undefined, content: args.content ?? args.code };
    }

    const rawFiles = (args.files || {}) as Record<string, unknown>;
    const hasFiles = rawFiles && Object.keys(rawFiles).length > 0;
    let tokensJson = "";

    if (hasFiles && typeof rawFiles["tokens.json"] === "string") {
      tokensJson = rawFiles["tokens.json"] as string;
    } else if (typeof args.content === "string" && args.content.trim().startsWith("{")) {
      tokensJson = args.content;
    } else if (typeof args.code === "string" && args.code.trim().startsWith("{")) {
      tokensJson = args.code;
    }

    if (!tokensJson) {
      // Fallback: treat content/code as CSS as before
      return {
        files: hasFiles
          ? (Object.fromEntries(
              Object.entries(rawFiles).filter(([, v]) => typeof v === "string"),
            ) as Record<string, string>)
          : undefined,
        content: args.content ?? args.code,
      };
    }

    const tokens = parseTokensFromJson(tokensJson);
    const css = tokensToRootCss(tokens);
    if (!css) {
      throw new Error("Failed to derive CSS from tokens.json (no tokens found)");
    }

    const files: Record<string, string> = {
      "theme.css": css,
      "tokens.json": tokensJson,
    };
    return { files, content: undefined };
  }

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
      const canonicalOwner =
        (await resolveOwner(ownerId))?.handle ?? ownerId;

      await deleteRegistryItem({
        ownerId,
        name,
        requestUserId: userId,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Deleted component @${canonicalOwner}/${name} and all of its versions.`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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

  server.registerTool("publish_component", {
    title: "Publish or update component",
    description:
      "Publish or update a design-layer UI component or theme in the registry. Components are distributed as shadcn-style source (not npm packages) and must not depend on app-specific logic (no '@/lib/*', '@/hooks/*', API calls, auth, wallets, etc.). Use type registry:theme to publish a CSS theme (design tokens); content must be CSS (e.g. :root { --color-primary: ... }). If the current user already owns an item with the same name, this creates a NEW VERSION. Requires: name (kebab-case), type (registry:block, registry:component, or registry:theme), title, and content (TSX for block/component, CSS for theme). Requires Bearer token.\n\nMulti-file bundles: If your entry file imports local files (e.g. import \"./button\" or \"../utils\"), you MUST submit a multi-file bundle via the `files` field. Provide `files` as a map of {\"index.tsx\": \"...\", \"button.tsx\": \"...\", ...}. All relative imports must be included in `files`, otherwise publish will fail.",
    inputSchema: z.object({
      name: z
        .string()
        .describe("Component name in kebab-case, e.g. my-hero-section"),
      type: z
        .enum(["registry:block", "registry:component", "registry:theme"])
        .describe(
          "registry:block for modules, registry:component for components, registry:theme for CSS theme/tokens",
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
          "Optional preview props object (will be stored in meta.previewProps and used by /preview)",
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
          "Visibility: public (default) or private. Private components only visible to owner with Bearer token.",
        ),
      bump: z
        .enum(["patch", "minor", "major"])
        .optional()
        .describe(
          "When updating an existing component, how to bump the version. Defaults to patch.",
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
      const { name, type, title, description, visibility, bump } = args;

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
        const rel = extractDependencies(content).filter((d) => isRelativeImport(d));
        if (rel.length > 0 && type !== "registry:theme") {
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
        const bundleValidation = validateComponentBundle(files);
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

        const missing = bundleValidation.missingImports ?? findMissingRelativeImports(files);
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

      // 归一化 theme：若 type === registry:theme，优先将 content / files 中的 JSON 视为 tokens.json，
      // 并从中派生 theme.css。
      const normalizedTheme = normalizeThemeArgs(args);

      // 如果当前用户已经有同名组件，则视为「发布新版本」，而不是创建新组件。
      const existing = await getRegistryItemByOwnerNameAndVersion(
        userId,
        name,
        null,
        userId,
      ).catch(() => null);

      if (existing) {
        const bumpType = bump ?? "patch";
        const result = await createRegistryItemVersion({
          ownerId: userId,
          name,
          content: normalizedTheme.content ?? (files ? content ?? undefined : undefined),
          files: normalizedTheme.files ?? files,
          bump: bumpType,
          userId,
          message: description || undefined,
          previewProps: args.previewProps,
        });

        const canonicalOwner =
          (await resolveOwner(existing.userId ?? userId))?.handle ??
          existing.userId ??
          "legacy";
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated "${existing.title}" (@${canonicalOwner}/${existing.name}) to version v${result.version}. View at /registry/${canonicalOwner}/${existing.name}`,
            },
          ],
        };
      }

      // 否则创建一个全新的组件（初始版本会在 createRegistryItem 中一并写入）
      // 仅保留裸模块依赖（npm 包），忽略相对路径 import
      const dependencies = (() => {
        const isBare = (spec: string) =>
          !spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("/");

        const allDeps = new Set<string>();

        const addDepsFromSource = (src: string | undefined | null) => {
          if (!src) return;
          for (const dep of extractDependencies(src)) {
            if (isBare(dep)) allDeps.add(dep);
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
      const item = await createRegistryItem({
        name,
        type,
        title,
        description: description || null,
        content: normalizedTheme.content ?? (files ? content ?? undefined : undefined),
        files: normalizedTheme.files ?? files,
        userId,
        visibility: visibility === "private" ? "private" : "public",
        dependencies,
        previewProps: args.previewProps,
      });

      const canonicalOwner =
        (await resolveOwner(item.userId ?? "legacy"))?.handle ??
        item.userId ??
        "legacy";
      return {
        content: [
          {
            type: "text" as const,
            text: `Published new component "${item.title}" (@${canonicalOwner}/${item.name}). View at /registry/${canonicalOwner}/${item.name}`,
          },
        ],
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

const APP_HOOK_PATTERNS = [
  "useLanguage(",
  "useI18n(",
  "useTranslations(",
  "useAuth(",
  "useSession(",
  "useWallet(",
  "useRouter(",
  "useSearchParams(",
  "useQueryClient(",
  "useQuery(",
  "useMutation(",
];

const APP_PROVIDER_PATTERNS = [
  "LanguageProvider",
  "I18nProvider",
  "AuthProvider",
  "SessionProvider",
  "WalletProvider",
  "QueryClientProvider",
  "RouterProvider",
];

function findAppSpecificUsage(sources: string[]): string[] {
  const hits = new Set<string>();
  for (const src of sources) {
    if (typeof src !== "string") continue;
    for (const p of APP_HOOK_PATTERNS) {
      if (src.includes(p)) hits.add(p.replace("(", ""));
    }
    for (const p of APP_PROVIDER_PATTERNS) {
      if (src.includes(`<${p}`) || src.includes(p + " ")) hits.add(p);
    }
  }
  return Array.from(hits).sort();
}
