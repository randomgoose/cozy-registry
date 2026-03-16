import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getRegistryItems,
  getRegistryItemByName,
  getRegistryItemByOwnerAndName,
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


  server.registerTool("get_component", {
    title: "Get component",
    description: "Get the main TSX source and metadata for a specific component. Use owner/name when multiple components share the same name. Returns the entry React/TSX code and props interface; future versions may expose additional bundle files.",
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
  }, async ({ name, owner }) => {
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

      const shadcnItem = toShadcnRegistryItem(item);
      const fileContent = shadcnItem?.files?.[0]?.content ?? "";
      const text = `## ${item.title} (${item.name})

${item.description || ""}

### Usage
Import and use in your React component. Props are defined in the interface.

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
  });

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
    description: "Publish or update a design-layer UI component in the registry. Components are distributed as shadcn-style source (not npm packages) and must not depend on app-specific logic (no '@/lib/*', '@/hooks/*', API calls, auth, wallets, etc.). If the current user already owns a component with the same name, this will create a NEW VERSION instead of a new component. Otherwise it creates a new component. Requires: name (kebab-case), type (registry:block or registry:component), title, and content (TSX source code). Requires Bearer token. Future versions may accept multi-file bundles; for now, keep dependencies within a single entry file or simple relative imports.",
    inputSchema: z.object({
      name: z
        .string()
        .describe("Component name in kebab-case, e.g. my-hero-section"),
      type: z
        .enum(["registry:block", "registry:component"])
        .describe(
          "registry:block for modules, registry:component for components",
        ),
      title: z.string().describe("Display title, e.g. Hero Section"),
      description: z
        .string()
        .optional()
        .describe("Optional description of the component"),
      content: z
        .string()
        .optional()
        .describe("Full TSX/React source code"),
      code: z
        .string()
        .optional()
        .describe("Alternative to content: TSX source code"),
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
    const content = args.content ?? args.code;
    if (!content) {
      return {
        content: [{ type: "text" as const, text: "Missing required field: content or code (TSX source)" }],
        isError: true,
      };
    }
    // Log raw input for debugging Figma Make request format (Vercel Logs)
    console.log("[MCP publish_component] raw args:", JSON.stringify({ ...args, contentLength: content.length }));

    try {
      const { name, type, title, description, visibility, bump } = args;

      const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!nameRegex.test(name)) {
        return {
          content: [{ type: "text" as const, text: `Invalid name: must be kebab-case (e.g. my-component)` }],
          isError: true,
        };
      }

      const validation = validateTsx(content);
      if (!validation.valid) {
        return {
          content: [{ type: "text" as const, text: `Invalid TSX: ${validation.error}` }],
          isError: true,
        };
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
      const existing = await getRegistryItemByOwnerAndName(userId, name, userId).catch(
        () => null,
      );

      if (existing) {
        const bumpType = bump ?? "patch";
        const result = await createRegistryItemVersion({
          ownerId: userId,
          name,
          content,
          bump: bumpType,
          userId,
          message: description || undefined,
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
      const dependencies = extractDependencies(content);
      const item = await createRegistryItem({
        name,
        type,
        title,
        description: description || null,
        content,
        userId,
        visibility: visibility === "private" ? "private" : "public",
        dependencies,
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
