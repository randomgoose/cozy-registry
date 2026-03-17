import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getRegistryItems,
  getRegistryItemByName,
  getRegistryItemByOwnerAndName,
  getRegistryItemVersions,
  getCurrentVersion,
  createRegistryItem,
  createRegistryItemVersion,
  deleteRegistryItem,
  toShadcnRegistryItem,
} from "./registry";
import { validateTsx, extractDependencies } from "./validate-tsx";
import { getUserIdFromToken } from "./auth-api";

export function createRegistryMcpServer(request?: Request) {
  const server = new McpServer({
    name: "cozy",
    version: "1.0.0",
  });


  server.registerTool("list_components", {
    title: "List components",
    description: "List all components and modules available in the registry. Use this to discover what's available before fetching a specific component. Components are distributed as shadcn-style source bundles (editable TSX), not npm packages. Public components are always listed; private components require Authorization: Bearer <token>.",
    inputSchema: z.object({}).describe("No input required"),
  }, async () => {
    const userId = request ? await getUserIdFromToken(request) : null;
    const items = await getRegistryItems(userId);
    const summary = items
      .map(
        (i) => {
          const owner = i.userId ?? "legacy";
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
            "Owner userId (e.g. legacy, or from list_components). Use when multiple components have the same name.",
          ),
      }),
    },
    async ({ name, owner }) => {
      try {
        const userId = request ? await getUserIdFromToken(request) : null;
        const item = owner
          ? await getRegistryItemByOwnerAndName(owner, name, userId)
          : await getRegistryItemByName(name, userId);

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Component "${name}" not found.`,
              },
            ],
            isError: true,
          };
        }

        const ownerId = (item as any).userId ?? owner ?? "legacy";
        const currentVersion = getCurrentVersion(item as any);
        const versions = await getRegistryItemVersions(
          ownerId,
          name,
          userId,
        );
        const latestVersion = versions[0]?.version ?? currentVersion;

        const shadcnItem = toShadcnRegistryItem(item);
        const mainFile = shadcnItem?.files?.[0];
        const rawFileContent = mainFile?.content ?? "";

        // 在入口 TSX 文件顶部注入 cozy-registry 注释头，方便 AI / 工具识别来源与版本
        const installVersion = latestVersion || currentVersion;
        const headerComment = `// cozy-registry: @${ownerId}/${item.name} v${installVersion}\n`;

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
        const lockEntry = {
          name: item.name,
          owner: ownerId,
          version: installVersion,
          type: item.type,
        };

        const lockSnippet = JSON.stringify(
          {
            components: {
              [`@${ownerId}/${item.name}`]: lockEntry,
            },
          },
          null,
          2,
        );

        const headerLines = [
          `## ${item.title} (@${ownerId}/${item.name})`,
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
        const userId = request ? await getUserIdFromToken(request) : null;

        const versions = await getRegistryItemVersions(owner, name, userId);
        if (!versions.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No versions found for @${owner}/${name}.`,
              },
            ],
            isError: true,
          };
        }

        const lines: string[] = [];
        lines.push(`## Versions for @${owner}/${name}`);
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
          "Owner userId (e.g. legacy, or from list_components). If omitted, assumes the current authenticated user.",
        ),
    }),
  }, async ({ name, owner }) => {
    try {
      const userId = request ? await getUserIdFromToken(request) : null;
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

      await deleteRegistryItem({
        ownerId,
        name,
        requestUserId: userId,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Deleted component @${ownerId}/${name} and all of its versions.`,
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
    description: "Publish or update a design-layer UI component or theme in the registry. Components are distributed as shadcn-style source (not npm packages) and must not depend on app-specific logic (no '@/lib/*', '@/hooks/*', API calls, auth, wallets, etc.). Use type registry:theme to publish a CSS theme (design tokens); content must be CSS (e.g. :root { --color-primary: ... }). If the current user already owns an item with the same name, this creates a NEW VERSION. Requires: name (kebab-case), type (registry:block, registry:component, or registry:theme), title, and content (TSX for block/component, CSS for theme). Requires Bearer token.",
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

      // 目前 validate 仍基于入口 TSX；多文件模式下由客户端保证 files 内 TSX/CSS 有效。
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
      }

      const userId = request ? await getUserIdFromToken(request) : null;
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

      // 如果当前用户已经有同名组件，则视为「发布新版本」，而不是创建新组件。
      const existing = await getRegistryItemByOwnerAndName(
        userId,
        name,
        userId,
      ).catch(
        () => null,
      );

      if (existing) {
        const bumpType = bump ?? "patch";
        const result = await createRegistryItemVersion({
          ownerId: userId,
          name,
          content: content ?? undefined,
          files,
          bump: bumpType,
          userId,
          message: description || undefined,
          previewProps: args.previewProps,
        });

        const ownerId = existing.userId ?? "legacy";
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated "${existing.title}" (@${ownerId}/${existing.name}) to version v${result.version}. View at /registry/${ownerId}/${existing.name}`,
            },
          ],
        };
      }

      // 否则创建一个全新的组件（初始版本会在 createRegistryItem 中一并写入）
      const dependencies = (() => {
        if (files) {
          const allDeps = new Set<string>();
          for (const source of Object.values(files)) {
            for (const dep of extractDependencies(source)) {
              allDeps.add(dep);
            }
          }
          return Array.from(allDeps).sort();
        }
        return content ? extractDependencies(content) : [];
      })();
      const item = await createRegistryItem({
        name,
        type,
        title,
        description: description || null,
        content: content ?? undefined,
        files,
        userId,
        visibility: visibility === "private" ? "private" : "public",
        dependencies,
        previewProps: args.previewProps,
      });

      const ownerId = item.userId ?? "legacy";
      return {
        content: [
          {
            type: "text" as const,
            text: `Published new component "${item.title}" (@${ownerId}/${item.name}). View at /registry/${ownerId}/${item.name}`,
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
