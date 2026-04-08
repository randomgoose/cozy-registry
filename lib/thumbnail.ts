import { REGISTRY_THEME_TYPE, normalizeRegistryItemType } from "@/lib/registry-types";
import {
  buildRegistryAssetPath,
  isSupabaseStorageConfigured,
  uploadPublicAsset,
} from "@/lib/storage";

export type RegistryThumbnailMeta = {
  url: string;
  kind: "theme-template" | "preview-capture";
  width: number;
  height: number;
  generatedAt: string;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseCssVariables(css: string) {
  const vars = new Map<string, string>();
  const pattern = /--([a-zA-Z0-9-_]+)\s*:\s*([^;}{]+);/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const [, rawName, rawValue] = match;
    const name = rawName.trim().toLowerCase();
    const value = rawValue.trim();
    if (!name || !value) continue;
    vars.set(`--${name}`, value);
  }
  return vars;
}

function pickCssVarWithName(
  vars: Map<string, string>,
  candidates: string[],
  fallback: string,
): { value: string; varName: string } {
  for (const candidate of candidates) {
    const value = vars.get(candidate.toLowerCase());
    if (value) return { value, varName: candidate };
  }
  return { value: fallback, varName: candidates[0] ?? "--" };
}

type ThemeSwatchPick = { value: string; varName: string };

/** 1200×900, 2×2 grid: primary | secondary / accent | background (matches /preview theme HTML). */
function buildThemeThumbnailSvgString(swatches: {
  primary: ThemeSwatchPick;
  secondary: ThemeSwatchPick;
  accent: ThemeSwatchPick;
  background: ThemeSwatchPick;
}) {
  const W = 1200;
  const H = 900;
  const cw = 600;
  const ch = 450;
  const cells: Array<ThemeSwatchPick & { x: number; y: number }> = [
    { ...swatches.primary, x: 0, y: 0 },
    { ...swatches.secondary, x: 600, y: 0 },
    { ...swatches.accent, x: 0, y: 450 },
    { ...swatches.background, x: 600, y: 450 },
  ];

  const rects = cells
    .map(
      (c) =>
        `<rect x="${c.x}" y="${c.y}" width="${cw}" height="${ch}" fill="${escapeXml(c.value)}"/>`,
    )
    .join("");

  const labels = cells
    .map(
      (c) =>
        `<text x="${c.x + 12}" y="${c.y + 26}" filter="url(#cozy-thumb-lbl)" fill="#f8fafc" font-size="20" font-family="ui-monospace, Menlo, Consolas, monospace" font-weight="600">${escapeXml(c.varName)}</text>`,
    )
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
  <defs>
    <filter id="cozy-thumb-lbl" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>
  ${rects}
  ${labels}
</svg>`.trim();
}

function buildThemeThumbnailDataUrl(swatches: {
  primary: ThemeSwatchPick;
  secondary: ThemeSwatchPick;
  accent: ThemeSwatchPick;
  background: ThemeSwatchPick;
}) {
  const svg = buildThemeThumbnailSvgString(swatches);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function maybeBuildRegistryThumbnail(params: {
  type: string;
  files?: Record<string, string> | null;
  content?: string | null;
  ownerId: string;
  itemName: string;
  version: string;
}): Promise<RegistryThumbnailMeta | undefined> {
  const normalizedType = normalizeRegistryItemType(params.type);
  if (normalizedType !== REGISTRY_THEME_TYPE) return undefined;

  const css =
    params.files?.["theme.css"] ??
    (typeof params.content === "string" ? params.content : "");

  if (!css || css.trim().length === 0) return undefined;

  const cssVars = parseCssVariables(css);
  const primary = pickCssVarWithName(
    cssVars,
    ["--color-primary", "--primary", "--brand", "--color-brand"],
    "#2563eb",
  );
  const secondary = pickCssVarWithName(
    cssVars,
    [
      "--color-secondary",
      "--secondary",
      "--color-primary-hover",
      "--primary-hover",
    ],
    "#1d4ed8",
  );
  const accent = pickCssVarWithName(
    cssVars,
    ["--color-accent", "--accent", "--color-highlight", "--highlight"],
    "#f59e0b",
  );
  const background = pickCssVarWithName(
    cssVars,
    ["--color-background", "--background", "--surface", "--color-surface"],
    "#ffffff",
  );
  const generatedAt = new Date().toISOString();
  const swatches = { primary, secondary, accent, background };
  const svg = buildThemeThumbnailSvgString(swatches);

  if (isSupabaseStorageConfigured()) {
    const path = buildRegistryAssetPath({
      scope: { kind: "user", id: params.ownerId },
      ownerId: params.ownerId,
      itemName: params.itemName,
      version: params.version,
      variant: "card",
      extension: "svg",
    });
    try {
      const uploaded = await uploadPublicAsset({
        path,
        body: svg,
        contentType: "image/svg+xml; charset=utf-8",
        cacheControl: "31536000",
        assetType: "thumbnail",
      });
      return {
        url: uploaded.url,
        kind: "theme-template",
        width: 1200,
        height: 900,
        generatedAt,
      };
    } catch (err) {
      // Wrong SUPABASE_* in env must not block registry publish; same as unset storage.
      console.warn(
        "[thumbnail] Supabase theme thumbnail upload failed; using inline data URL",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    url: buildThemeThumbnailDataUrl(swatches),
    kind: "theme-template",
    width: 1200,
    height: 900,
    generatedAt,
  };
}

export type PreviewCapturePlan = {
  previewPath: string;
  viewport: { width: number; height: number };
  output: { width: number; height: number };
  fit: "cover" | "contain";
  alignY: "top" | "center";
};

export function getPreviewCapturePlan(params: {
  owner: string;
  name: string;
  version: string;
  project?: string | null;
}): PreviewCapturePlan {
  const search = new URLSearchParams({
    v: params.version,
    thumbnail: "1",
  });
  if (params.project && params.project.trim().length > 0) {
    search.set("project", params.project.trim());
  }

  return {
    previewPath: `/preview/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}?${search.toString()}`,
    viewport: { width: 1440, height: 960 },
    output: { width: 1200, height: 900 },
    fit: "cover",
    alignY: "top",
  };
}

export function getThumbnailFromMeta(
  meta: Record<string, unknown> | null | undefined,
): RegistryThumbnailMeta | null {
  const raw = meta?.thumbnail;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.url !== "string" || !record.url) return null;
  return {
    url: record.url,
    kind:
      record.kind === "preview-capture" ? "preview-capture" : "theme-template",
    width: typeof record.width === "number" ? record.width : 1200,
    height: typeof record.height === "number" ? record.height : 900,
    generatedAt:
      typeof record.generatedAt === "string"
        ? record.generatedAt
        : new Date(0).toISOString(),
  };
}
