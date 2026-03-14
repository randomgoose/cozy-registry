import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRegistryItems, getRegistryItemByName, getRegistryItemByOwnerAndName, createRegistryItem, toShadcnRegistryItem } from "./registry";
import { validateTsx, extractDependencies } from "./validate-tsx";
import { getUserIdFromToken } from "./auth-api";

export function createRegistryMcpServer(request?: Request) {
  const server = new McpServer({
    name: "cozy",
    version: "1.0.0",
  });

  server.tool(
    "list_components",
    "List all components and modules available in the registry. Use this to discover what's available before fetching a specific component. Public components are always listed; private components require Authorization: Bearer <token>.",
    {},
    async () => {
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
    }
  );

  server.tool(
    "get_component",
    "Get the full source code and metadata for a specific component. Use owner/name when multiple components share the same name. Returns the React/TSX code and props interface.",
    {
      name: z.string().describe("Component name, e.g. hero-section, faq, pricing-card"),
      owner: z.string().optional().describe("Owner userId (e.g. legacy, or from list_components). Use when multiple components have the same name."),
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
    }
  );

  server.tool(
    "publish_component",
    "Publish a new component to the registry. Use when the user wants to submit or add a component. Requires: name (kebab-case), type (registry:block or registry:component), title, and content (TSX source code). Requires Bearer token.",
    {
      name: z.string().describe("Component name in kebab-case, e.g. my-hero-section"),
      type: z.enum(["registry:block", "registry:component"]).describe("registry:block for modules, registry:component for components"),
      title: z.string().describe("Display title, e.g. Hero Section"),
      description: z.string().optional().describe("Optional description of the component"),
      content: z.string().optional().describe("Full TSX/React source code"),
      code: z.string().optional().describe("Alternative to content: TSX source code"),
      visibility: z.enum(["public", "private"]).optional().describe("Visibility: public (default) or private. Private components only visible to owner with Bearer token."),
    },
    async (args) => {
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
        const { name, type, title, description, visibility } = args;

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
              text: `Published "${item.title}" (@${ownerId}/${item.name}). View at /registry/${ownerId}/${item.name}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("unique") || msg.includes("duplicate")) {
          return {
            content: [{ type: "text" as const, text: `You already have a component with this name. Use a different name or update the existing one.` }],
            isError: true,
          };
        }
        console.error("[MCP publish_component] error:", msg);
        return {
          content: [{ type: "text" as const, text: `Failed to publish: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
