#!/usr/bin/env npx tsx
/**
 * Cozy Registry MCP Server (stdio)
 *
 * Exposes list_components and get_component tools for AI clients that prefer
 * local stdio instead of the HTTP MCP endpoint exposed by cozy-platform.
 *
 * Requires COZY_PLATFORM_BASE_URL env (default: http://localhost:3000)
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const READ_REGISTRY: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

const COZY_PLATFORM_BASE_URL =
  process.env.COZY_PLATFORM_BASE_URL ||
  process.env.COZY_REGISTRY_URL ||
  process.env.REGISTRY_URL ||
  "http://localhost:3000";

async function fetchRegistry<T>(path: string): Promise<T> {
  const res = await fetch(`${COZY_PLATFORM_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Cozy platform fetch failed: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

const server = new McpServer({
  name: "cozy",
  version: "1.0.0",
});

server.tool(
  "list_components",
  "List all components and modules available in the registry. Use this to discover what's available before fetching a specific component.",
  {},
  READ_REGISTRY,
  async () => {
    const registry = await fetchRegistry<{
      items: Array<{ name: string; type: string; title: string; description?: string }>;
    }>("/registry");

    const summary = registry.items
      .map(
        (i) =>
          `- **${i.name}** (${i.type}): ${i.title}${i.description ? ` - ${i.description}` : ""}`
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Available components (${registry.items.length}):\n\n${summary}`,
        },
      ],
    };
  }
);

server.tool(
  "get_component",
  "Get the full source code and metadata for a specific component. Prefer owner + name when available; falls back to legacy single-name lookup when owner is omitted.",
  {
    name: z.string().describe("Component name, e.g. hero-section, faq, pricing-card"),
    owner: z
      .string()
      .optional()
      .describe(
        "Optional owner id. When present, fetches from /r/{owner}/{name}. When omitted, falls back to /r/{name}.",
      ),
  },
  READ_REGISTRY,
  async ({ name, owner }) => {
    try {
      const path = owner
        ? `/r/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
        : `/r/${encodeURIComponent(name)}`;

      const item = await fetchRegistry<{
        name: string;
        type: string;
        title: string;
        description?: string;
        files: Array<{ path: string; content: string; type: string }>;
      }>(path);

      if (!item) {
        return {
          content: [{ type: "text" as const, text: `Component "${name}" not found.` }],
          isError: true,
        };
      }

      const fileContent = item.files?.[0]?.content ?? "";
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
            text: `Failed to fetch component "${name}": ${msg}. Is cozy-platform running at ${COZY_PLATFORM_BASE_URL}?`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
