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

function pickCssVar(
  vars: Map<string, string>,
  candidates: string[],
  fallback: string,
) {
  for (const candidate of candidates) {
    const value = vars.get(candidate.toLowerCase());
    if (value) return value;
  }
  return fallback;
}

function buildThemeThumbnailDataUrl(params: {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
}) {
  const width = 1200;
  const height = 900;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
      <rect width="${width}" height="${height}" fill="${escapeXml(params.background)}" />
      <rect width="600" height="${height}" x="0" y="0" fill="${escapeXml(params.primary)}" />
      <rect width="380" height="${height}" x="600" y="0" fill="${escapeXml(params.secondary)}" />
      <rect width="220" height="${height}" x="980" y="0" fill="${escapeXml(params.accent)}" />
      <g>
        <rect x="870" y="650" width="290" height="176" rx="28" fill="rgba(255,255,255,0.78)" />
        <text x="900" y="697" fill="${escapeXml(params.foreground)}" fill-opacity="0.52" font-size="26" font-family="Inter, system-ui, sans-serif" font-weight="700" letter-spacing="3.2">Theme</text>
        <circle cx="916" cy="734" r="9" fill="${escapeXml(params.primary)}" />
        <text x="939" y="741" fill="${escapeXml(params.foreground)}" font-size="28" font-family="Inter, system-ui, sans-serif" font-weight="600">Primary</text>
        <circle cx="916" cy="776" r="9" fill="${escapeXml(params.secondary)}" />
        <text x="939" y="783" fill="${escapeXml(params.foreground)}" font-size="28" font-family="Inter, system-ui, sans-serif" font-weight="600">Secondary</text>
        <circle cx="916" cy="818" r="9" fill="${escapeXml(params.accent)}" />
        <text x="939" y="825" fill="${escapeXml(params.foreground)}" font-size="28" font-family="Inter, system-ui, sans-serif" font-weight="600">Accent</text>
      </g>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildThemeThumbnailSvg(params: {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
}) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" fill="none">
      <rect width="1200" height="900" fill="${escapeXml(params.background)}" />
      <rect width="600" height="900" x="0" y="0" fill="${escapeXml(params.primary)}" />
      <rect width="380" height="900" x="600" y="0" fill="${escapeXml(params.secondary)}" />
      <rect width="220" height="900" x="980" y="0" fill="${escapeXml(params.accent)}" />
      <g>
        <rect x="870" y="650" width="290" height="176" rx="28" fill="rgba(255,255,255,0.78)" />
        <text x="900" y="697" fill="${escapeXml(params.foreground)}" fill-opacity="0.52" font-size="26" font-family="Inter, system-ui, sans-serif" font-weight="700" letter-spacing="3.2">Theme</text>
        <circle cx="916" cy="734" r="9" fill="${escapeXml(params.primary)}" />
        <text x="939" y="741" fill="${escapeXml(params.foreground)}" font-size="28" font-family="Inter, system-ui, sans-serif" font-weight="600">Primary</text>
        <circle cx="916" cy="776" r="9" fill="${escapeXml(params.secondary)}" />
        <text x="939" y="783" fill="${escapeXml(params.foreground)}" font-size="28" font-family="Inter, system-ui, sans-serif" font-weight="600">Secondary</text>
        <circle cx="916" cy="818" r="9" fill="${escapeXml(params.accent)}" />
        <text x="939" y="825" fill="${escapeXml(params.foreground)}" font-size="28" font-family="Inter, system-ui, sans-serif" font-weight="600">Accent</text>
      </g>
    </svg>
  `.trim();
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
  const background = pickCssVar(
    cssVars,
    ["--color-background", "--background", "--surface", "--color-surface"],
    "#ffffff",
  );
  const foreground = pickCssVar(
    cssVars,
    ["--color-foreground", "--foreground", "--color-text", "--text"],
    "#111827",
  );
  const primary = pickCssVar(
    cssVars,
    ["--color-primary", "--primary", "--brand", "--color-brand"],
    "#2563eb",
  );
  const secondary = pickCssVar(
    cssVars,
    ["--color-secondary", "--secondary", "--color-primary-hover", "--primary-hover"],
    "#1d4ed8",
  );
  const accent = pickCssVar(
    cssVars,
    ["--color-accent", "--accent", "--color-highlight", "--highlight"],
    "#f59e0b",
  );
  const generatedAt = new Date().toISOString();
  const svg = buildThemeThumbnailSvg({
    primary,
    secondary,
    accent,
    background,
    foreground,
  });

  if (isSupabaseStorageConfigured()) {
    const path = buildRegistryAssetPath({
      scope: { kind: "user", id: params.ownerId },
      ownerId: params.ownerId,
      itemName: params.itemName,
      version: params.version,
      variant: "card",
      extension: "svg",
    });
    const uploaded = await uploadPublicAsset({
      path,
      body: svg,
      contentType: "image/svg+xml; charset=utf-8",
      cacheControl: "31536000",
    });
    return {
      url: uploaded.url,
      kind: "theme-template",
      width: 1200,
      height: 900,
      generatedAt,
    };
  }

  return {
    url: buildThemeThumbnailDataUrl({
      primary,
      secondary,
      accent,
      background,
      foreground,
    }),
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
}) : PreviewCapturePlan {
  return {
    previewPath: `/preview/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}?v=${encodeURIComponent(params.version)}&thumbnail=1`,
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
