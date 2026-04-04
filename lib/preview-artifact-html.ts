import type { PreviewCompatibleExternal } from "@/lib/preview-dependency-provider";

export const PREVIEW_REACT_VERSION = "19.2.3";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlCss(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function buildImportMap(input: {
  compatibleExternals: PreviewCompatibleExternal[];
  isDev: boolean;
}): Record<string, string> {
  const devSuffix = input.isDev ? "?dev" : "";
  const reactExternal = "?external=react,react-dom,react-dom/client";

  const imports: Record<string, string> = {
    react: `https://esm.sh/react@${PREVIEW_REACT_VERSION}${devSuffix}`,
    "react-dom": `https://esm.sh/react-dom@${PREVIEW_REACT_VERSION}${devSuffix}`,
    "react-dom/client": `https://esm.sh/react-dom@${PREVIEW_REACT_VERSION}/client${devSuffix}`,
    "react/jsx-runtime": `https://esm.sh/react@${PREVIEW_REACT_VERSION}/jsx-runtime${devSuffix}`,
  };

  for (const ext of input.compatibleExternals) {
    const target = ext.importMapTarget?.trim();
    if (!target || target in imports) continue;
    const base = `https://esm.sh/${target}${devSuffix}`;
    const joiner = base.includes("?") ? "&" : "?";
    imports[target] = `${base}${joiner}${reactExternal.slice(1)}`;
  }

  return imports;
}

function buildModulepreloadHints(imports: Record<string, string>): string {
  const reactKeys = ["react", "react-dom", "react-dom/client", "react/jsx-runtime"];
  return [
    `<link rel="preconnect" href="https://esm.sh" crossorigin />`,
    ...reactKeys
      .filter((k) => k in imports)
      .map((k) => `<link rel="modulepreload" href="${escapeHtml(imports[k])}" />`),
  ].join("\n    ");
}

export type BuildArtifactPreviewHtmlInput = {
  jsUrl: string;
  cssUrl?: string | null;
  themeCss?: string | null;
  compatibleExternals?: PreviewCompatibleExternal[];
  mode: "default" | "thumbnail";
};

/**
 * Assembles a complete, self-contained preview HTML document.
 * This is the static artifact that replaces the request-time HTML assembly.
 */
export function buildArtifactPreviewHtml(input: BuildArtifactPreviewHtmlInput): string {
  const isDev = input.mode === "default";
  const compatibleExternals = input.compatibleExternals ?? [];
  const imports = buildImportMap({ compatibleExternals, isDev });
  const importMapJson = JSON.stringify({ imports }, null, 2);
  const preloadHints = buildModulepreloadHints(imports);
  const isThumbnail = input.mode === "thumbnail";

  const cssLink =
    input.cssUrl != null && input.cssUrl !== ""
      ? `\n    <link rel="stylesheet" href="${escapeHtml(input.cssUrl)}" />`
      : "";

  const themeStyle =
    input.themeCss != null && input.themeCss.trim() !== ""
      ? `\n    <style>${escapeHtmlCss(input.themeCss)}</style>`
      : "";

  const bodyClass = isThumbnail
    ? "min-h-screen overflow-hidden bg-transparent"
    : "min-h-screen bg-white";
  const bodyStyle = isThumbnail ? "background:transparent;" : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Component Preview</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${preloadHints}${cssLink}${themeStyle}
    <script type="importmap">
${importMapJson}
    </script>
    <script>
    (function(){var p=new URLSearchParams(location.search);var t=p.get("theme");if(t)document.documentElement.className=t;})();
    </script>
  </head>
  <body class="${bodyClass}" style="${bodyStyle}">
    <div id="root"></div>
    <script type="module" src="/assets/preview-runtime-v1.js"></script>
    <script type="module">
import ${JSON.stringify(input.jsUrl)};
    </script>
  </body>
</html>`;
}
