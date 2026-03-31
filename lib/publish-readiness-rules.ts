export type PreviewExportAdvice = {
  detectedExports: string[];
  hasDefaultExport: boolean;
  recommendedPreviewExport: string | null;
  note: string | null;
};

export function getPreviewExportAdvice(params: {
  name: string;
  previewExport?: string;
  files?: Record<string, string> | undefined;
  content?: string | null | undefined;
}): PreviewExportAdvice {
  const sources: string[] = [];
  if (params.files) {
    for (const [filePath, src] of Object.entries(params.files)) {
      if (!/\.(tsx?|jsx?)$/i.test(filePath)) continue;
      if (typeof src === "string") sources.push(src);
    }
  } else if (typeof params.content === "string") {
    sources.push(params.content);
  }

  const exports = new Set<string>();
  let hasDefaultExport = false;
  for (const src of sources) {
    if (/\bexport\s+default\b/.test(src)) hasDefaultExport = true;
    const matches = src.matchAll(/\bexport\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g);
    for (const m of matches) {
      if (m[1]) exports.add(m[1]);
    }
    const namedList = src.match(/\bexport\s*\{\s*([^}]+)\s*\}/);
    if (namedList && namedList[1]) {
      for (const part of namedList[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/i)[0]?.trim();
        if (name) exports.add(name);
      }
    }
  }

  const detectedExports = Array.from(exports).sort();
  const recommendedPreviewExport =
    typeof params.previewExport === "string" && params.previewExport.trim()
      ? params.previewExport.trim()
      : detectedExports.includes("PreviewComponent")
        ? "PreviewComponent"
        : detectedExports.includes(slugToPascalExportName(params.name))
          ? slugToPascalExportName(params.name)
          : detectedExports.includes(slugToCamelExportName(params.name))
            ? slugToCamelExportName(params.name)
            : detectedExports.length === 1
              ? detectedExports[0]!
              : null;

  const note =
    hasDefaultExport
      ? null
      : recommendedPreviewExport
        ? `No default export detected. Consider setting previewExport: "${recommendedPreviewExport}".`
        : "No default export detected. Consider adding a default export or providing previewExport.";

  return {
    detectedExports,
    hasDefaultExport,
    recommendedPreviewExport,
    note,
  };
}

function slugToPascalExportName(slug: string): string {
  return slug
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((s) => (s[0] ? s[0].toUpperCase() + s.slice(1) : ""))
    .join("");
}

function slugToCamelExportName(slug: string): string {
  const parts = slug.split(/[^a-zA-Z0-9]/).filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  const head = first ? first[0].toLowerCase() + first.slice(1) : "";
  const tail = rest.map((p) => (p[0] ? p[0].toUpperCase() + p.slice(1) : "")).join("");
  return head + tail;
}

