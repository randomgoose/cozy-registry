import { parseTokensFromJson, tokensToRootCss } from "@/lib/theme-tokens";
import { REGISTRY_THEME_TYPE, normalizeRegistryItemType } from "@/lib/registry-types";

/**
 * Normalizes theme publish payloads (tokens.json → theme.css) for MCP and API.
 * Throws if tokens JSON cannot produce CSS.
 */
export function normalizePublishThemeArgs(args: {
  type: string;
  files?: Record<string, string> | null;
  content?: string;
  code?: string;
}): { files?: Record<string, string>; content?: string | undefined } {
  if (normalizeRegistryItemType(args.type) !== REGISTRY_THEME_TYPE) {
    return { files: args.files ?? undefined, content: args.content ?? args.code };
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

  return {
    files: {
      "theme.css": css,
      "tokens.json": tokensJson,
    },
    content: undefined,
  };
}
