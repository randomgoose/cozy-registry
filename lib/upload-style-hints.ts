import { REGISTRY_THEME_TYPE, normalizeRegistryItemType } from "@/lib/registry-types";

export type UploadHint = {
  level: "info" | "warning";
  code: string;
  message: string;
  evidence: string[];
};

type AnalyzeInput = {
  itemType: string;
  files?: Record<string, string> | null;
  content?: string | null;
};

const ROOT_BLOCK_RE = /:root\s*\{/;
const DARK_BLOCK_RE = /\.dark\b[^{]*\{/;
const CSS_VAR_DECL_RE = /--[a-z0-9-_]+\s*:/gi;
const SHADCN_TOKEN_RE =
  /\b(bg|text|border|ring|from|to|via)-(background|foreground|primary|secondary|accent|muted|card|popover|destructive|border|input|ring)\b/g;

function collectSources(input: AnalyzeInput): string[] {
  if (input.files && Object.keys(input.files).length > 0) {
    return Object.values(input.files);
  }
  if (typeof input.content === "string" && input.content.trim().length > 0) {
    return [input.content];
  }
  return [];
}

function takeUnique(items: string[], limit = 6): string[] {
  return Array.from(new Set(items)).slice(0, limit);
}

export function analyzeUploadStyleHints(input: AnalyzeInput): UploadHint[] {
  const normalizedType = normalizeRegistryItemType(input.itemType);
  if (normalizedType === REGISTRY_THEME_TYPE) return [];

  const sources = collectSources(input);
  if (sources.length === 0) return [];

  let hasRoot = false;
  let hasDark = false;
  let varDeclCount = 0;
  const seenVars: string[] = [];
  const seenTokenClasses: string[] = [];

  for (const source of sources) {
    if (ROOT_BLOCK_RE.test(source)) hasRoot = true;
    if (DARK_BLOCK_RE.test(source)) hasDark = true;

    const varMatches = source.match(CSS_VAR_DECL_RE) ?? [];
    varDeclCount += varMatches.length;
    for (const raw of varMatches) {
      seenVars.push(raw.replace(/\s*:\s*$/, ""));
    }

    const tokenMatches = source.match(SHADCN_TOKEN_RE) ?? [];
    seenTokenClasses.push(...tokenMatches);
  }

  const hints: UploadHint[] = [];

  const looksLikeThemePayload =
    varDeclCount >= 8 || (hasRoot && varDeclCount >= 4) || (hasRoot && hasDark && varDeclCount >= 3);

  if (looksLikeThemePayload) {
    const evidence = takeUnique([
      ...(hasRoot ? [":root"] : []),
      ...(hasDark ? [".dark"] : []),
      ...seenVars,
    ]);
    hints.push({
      level: "warning",
      code: "possible-theme-css",
      message:
        "Detected global CSS variables/theme-like styles. Consider publishing them as a registry:theme item and referencing it via registryDependencies.",
      evidence,
    });
  }

  if (seenTokenClasses.length >= 3) {
    hints.push({
      level: "info",
      code: "token-utility-detected",
      message:
        "Detected token-based Tailwind utilities (e.g. bg-background). Ensure preview/runtime has a compatible theme CSS that defines related variables.",
      evidence: takeUnique(seenTokenClasses),
    });
  }

  return hints;
}
