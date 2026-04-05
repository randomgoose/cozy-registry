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
  bundledReact: boolean;
}): Record<string, string> {
  const devSuffix = input.isDev ? "?dev" : "";
  const reactExternal = "?external=react,react-dom,react-dom/client";

  const imports: Record<string, string> = {};

  if (!input.bundledReact) {
    imports["react"] = `https://esm.sh/react@${PREVIEW_REACT_VERSION}${devSuffix}`;
    imports["react-dom"] = `https://esm.sh/react-dom@${PREVIEW_REACT_VERSION}${devSuffix}`;
    imports["react-dom/client"] = `https://esm.sh/react-dom@${PREVIEW_REACT_VERSION}/client${devSuffix}`;
    imports["react/jsx-runtime"] = `https://esm.sh/react@${PREVIEW_REACT_VERSION}/jsx-runtime${devSuffix}`;
  }

  for (const ext of input.compatibleExternals) {
    const target = ext.importMapTarget?.trim();
    if (!target || target in imports) continue;
    const base = `https://esm.sh/${target}${devSuffix}`;
    const joiner = base.includes("?") ? "&" : "?";
    imports[target] = `${base}${joiner}${reactExternal.slice(1)}&bundle`;
  }

  return imports;
}

function buildHeadHints(imports: Record<string, string>, bundledReact: boolean): string {
  if (Object.keys(imports).length === 0) return "";

  const lines: string[] = [];

  const hasEsmSh = Object.values(imports).some((v) => v.includes("esm.sh"));
  if (hasEsmSh) {
    lines.push(`<link rel="preconnect" href="https://esm.sh" crossorigin />`);
  }

  if (!bundledReact) {
    const reactKeys = ["react", "react-dom", "react-dom/client", "react/jsx-runtime"];
    for (const k of reactKeys) {
      if (k in imports) {
        lines.push(`<link rel="modulepreload" href="${escapeHtml(imports[k])}" />`);
      }
    }
  }

  return lines.join("\n    ");
}

export type BuildArtifactPreviewHtmlInput = {
  jsUrl: string;
  cssUrl?: string | null;
  themeCss?: string | null;
  compatibleExternals?: PreviewCompatibleExternal[];
  mode: "default" | "thumbnail";
  bundledReact?: boolean;
};

/**
 * Assembles a complete, self-contained preview HTML document.
 * When bundledReact is true, React is inside preview.js — no esm.sh needed for React.
 */
export function buildArtifactPreviewHtml(input: BuildArtifactPreviewHtmlInput): string {
  const bundledReact = input.bundledReact === true;
  const isDev = !bundledReact && input.mode === "default";
  const compatibleExternals = input.compatibleExternals ?? [];
  const imports = buildImportMap({ compatibleExternals, isDev, bundledReact });
  const hasImportMap = Object.keys(imports).length > 0;
  const isThumbnail = input.mode === "thumbnail";

  const headHints = buildHeadHints(imports, bundledReact);
  const headHintsBlock = headHints ? `\n    ${headHints}` : "";

  const cssLink =
    input.cssUrl != null && input.cssUrl !== ""
      ? `\n    <link rel="stylesheet" href="${escapeHtml(input.cssUrl)}" />`
      : "";

  const themeStyle =
    input.themeCss != null && input.themeCss.trim() !== ""
      ? `\n    <style>${escapeHtmlCss(input.themeCss)}</style>`
      : "";

  const importMapBlock = hasImportMap
    ? `\n    <script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n    </script>`
    : "";

  const runtimeScript = bundledReact
    ? ""
    : `\n    <script type="module" src="/assets/preview-runtime-v1.js"></script>`;

  const bodyClass = isThumbnail
    ? "min-h-screen overflow-hidden bg-transparent"
    : "min-h-screen bg-white";
  const bodyStyle = isThumbnail ? "background:transparent;" : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Component Preview</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />${headHintsBlock}${cssLink}${themeStyle}${importMapBlock}
    <script>
    (function(){var p=new URLSearchParams(location.search);var t=p.get("theme");if(t)document.documentElement.className=t;})();
    </script>
  </head>
  <body class="${bodyClass}" style="${bodyStyle}">
    <div id="root"></div>${runtimeScript}
    <script type="module">
import ${JSON.stringify(input.jsUrl)};
    </script>
  </body>
</html>`;
}
