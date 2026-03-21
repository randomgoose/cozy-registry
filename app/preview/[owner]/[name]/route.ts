import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getRegistryItemByOwnerNameAndVersion,
  toShadcnRegistryItem,
  getThemeEntryCss,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";
import { buildPreviewBundle } from "@/lib/preview-build";
import { extractDependencies } from "@/lib/validate-tsx";
import { resolveTransitiveThemeCss } from "@/lib/registry-resolver";

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
    const key = candidate.toLowerCase();
    const value = vars.get(key);
    if (value) return value;
  }
  return fallback;
}

const DEMO_PROPS: Record<string, unknown> = {
  "hero-section": {
    title: "Welcome to Our Product",
    subtitle: "Build something amazing with our platform",
    ctaText: "Get Started",
    ctaHref: "#",
  },
  faq: {
    items: [
      {
        question: "What is this?",
        answer: "A component registry for your team.",
      },
      {
        question: "How do I use it?",
        answer: "Copy the code and paste into your project.",
      },
    ],
    title: "Frequently Asked Questions",
  },
  "pricing-card": {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For growing teams",
    features: [
      { text: "Unlimited projects", included: true },
      { text: "Priority support", included: true },
      { text: "Advanced analytics", included: false },
    ],
    ctaText: "Get Started",
    highlighted: true,
  },
};

function isBareModuleSpecifier(spec: string): boolean {
  return (
    !spec.startsWith("./") &&
    !spec.startsWith("../") &&
    !spec.startsWith("/")
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const version = url.searchParams.get("v") ?? null;
  const previewMode =
    url.searchParams.get("thumbnail") === "1" ? "thumbnail" : "default";

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? (await getUserIdFromToken(request));
  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    version,
    userId,
  );

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Theme 条目：仅注入主题 CSS，展示简易预览页（STYLE_AND_THEME_SPEC §5.1 可选）
  if (item.type === "registry:theme") {
    const themeCss = getThemeEntryCss(item);
    const cssVars = parseCssVariables(themeCss);
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
    const muted = pickCssVar(
      cssVars,
      ["--color-muted", "--muted", "--color-muted-foreground", "--muted-foreground"],
      "rgba(107,114,128,0.9)",
    );
    const border = pickCssVar(
      cssVars,
      ["--color-border", "--border", "--color-outline", "--outline"],
      "rgba(17,24,39,0.12)",
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
    const radius = pickCssVar(
      cssVars,
      ["--radius-lg", "--radius-md", "--radius", "--rounded"],
      "20px",
    );
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Theme: ${item.title ?? name}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>${escapeHtmlCss(themeCss)}</style>
  </head>
  <body style="min-height:100vh;margin:0;background:${escapeHtml(background)};color:${escapeHtml(foreground)};">
    <main style="position:relative;display:grid;min-height:100vh;grid-template-columns:1.7fr 1.2fr 0.9fr;overflow:hidden;">
      <section style="background:${escapeHtml(primary)};"></section>
      <section style="background:${escapeHtml(secondary)};"></section>
      <section style="background:${escapeHtml(accent)};"></section>

      <div style="position:absolute;right:20px;bottom:20px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;padding:14px 16px;border:1px solid ${escapeHtml(border)};border-radius:${escapeHtml(radius)};background:color-mix(in srgb, ${escapeHtml(background)} 88%, transparent);backdrop-filter:blur(10px);box-shadow:0 12px 40px rgba(0,0,0,0.12);">
        <div style="font:600 11px/1 system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;letter-spacing:0.12em;text-transform:uppercase;color:${escapeHtml(muted)};">Theme</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="height:10px;width:10px;border-radius:999px;background:${escapeHtml(primary)};"></div>
          <div style="font:500 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;color:${escapeHtml(foreground)};">Primary</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="height:10px;width:10px;border-radius:999px;background:${escapeHtml(secondary)};"></div>
          <div style="font:500 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;color:${escapeHtml(foreground)};">Secondary</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="height:10px;width:10px;border-radius:999px;background:${escapeHtml(accent)};"></div>
          <div style="font:500 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;color:${escapeHtml(foreground)};">Accent</div>
        </div>
      </div>
    </main>
  </body>
</html>`;
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  const filesArray = shadcnItem?.files ?? [];

  const files: Record<string, string> = {};
  for (const f of filesArray) {
    files[f.path] = f.content;
  }

  const rawPreviewProps =
    item.meta && typeof item.meta === "object"
      ? (item.meta as Record<string, unknown>).previewProps
      : undefined;
  let previewProps: unknown;
  if (rawPreviewProps === undefined || rawPreviewProps === null) {
    previewProps = DEMO_PROPS[name] ?? {};
  } else if (typeof rawPreviewProps === "string") {
    try {
      previewProps = JSON.parse(rawPreviewProps);
    } catch {
      previewProps = DEMO_PROPS[name] ?? {};
    }
  } else {
    previewProps = rawPreviewProps;
  }

  // 运行时依赖来源：
  // - 存储在 DB 中的 item.dependencies（兼容旧数据）
  // - 从所有源码文件中动态提取的 bare imports
  const depsFromDb = (item.dependencies ?? []) as string[];
  const depsFromFiles = new Set<string>();
  for (const source of Object.values(files)) {
    for (const dep of extractDependencies(source)) {
      depsFromFiles.add(dep);
    }
  }
  const allDependencies = Array.from(
    new Set<string>([...depsFromDb, ...depsFromFiles]),
  ).sort();
  // 仅对裸模块依赖构建 import map / external；相对路径交给 esbuild 走本地文件
  const runtimeDependencies = allDependencies.filter(isBareModuleSpecifier);

  const buildResult = await buildPreviewBundle(
    {
      name: item.name,
      version: version ?? item.currentVersion ?? "0.1.0",
      files,
      // 传给 esbuild，用于 external 出所有运行时依赖
      dependencies: runtimeDependencies,
    },
    previewProps,
    { mode: previewMode },
  );

  if (!buildResult.ok) {
    const err = buildResult.error;
    const details =
      err.file && err.line != null
        ? `${err.file}:${err.line}:${err.column ?? 0}`
        : "";
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Preview build error</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;background:#fef2f2;color:#b91c1c;">
    <h1 style="font-size:16px;margin:0 0 8px;">Preview build failed</h1>
    <pre style="white-space:pre-wrap;font-size:13px;background:#fff;border-radius:8px;border:1px solid #fecaca;padding:12px;color:#991b1b;">${err.message}${details ? "\\n" + details : ""
      }</pre>
  </body>
</html>`;

    return new NextResponse(html, {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }

  // 根据环境切换 React dev / prod 版本
  const isDev = process.env.NODE_ENV !== "production";

  const reactBase = "https://esm.sh/react@19";
  const reactDomBase = "https://esm.sh/react-dom@19";
  const reactDomClientBase = "https://esm.sh/react-dom@19/client";
  const reactJsxRuntimeBase = "https://esm.sh/react@19/jsx-runtime";
  const devSuffix = isDev ? "?dev" : "";

  // 基本 import map：始终提供 React 运行时（与项目 React 版本保持一致）
  const importMap: Record<string, string> = {
    react: `${reactBase}${devSuffix}`,
    "react-dom": `${reactDomBase}${devSuffix}`,
    "react-dom/client": `${reactDomClientBase}${devSuffix}`,
    "react/jsx-runtime": `${reactJsxRuntimeBase}${devSuffix}`,
  };

  // 告诉 CDN 依赖不要内联自己的 React，而是从 import map 取
  const reactExternalQuery = "?external=react,react-dom,react-dom/client";

  // 根据组件声明的 dependencies 动态扩展 import map。
  // 策略：所有 bare import <pkg> → https://esm.sh/<pkg>?external=react,react-dom,react-dom/client
  for (const dep of runtimeDependencies) {
    if (!dep) continue;
    if (dep in importMap) continue;
    importMap[dep] = `https://esm.sh/${dep}${reactExternalQuery}`;
  }

  const importMapJson = JSON.stringify({ imports: importMap }, null, 2);

  // 按 SPEC §5.5：递归解析 registryDependencies，先注入所有 theme CSS（Tailwind 之后、preview.js 之前）
  let themeStyles = "";
  try {
    const { css } = await resolveTransitiveThemeCss({
      owner,
      name,
      version,
      requestUserId: userId,
    });
    if (css && css.trim().length > 0) {
      themeStyles = `\n    <style>${escapeHtmlCss(css)}</style>`;
    }
  } catch {
    // Theme deps failure should not block preview rendering.
    themeStyles = "";
  }
  const bundleStyles =
    buildResult.css != null && buildResult.css !== ""
      ? `\n    <style>${escapeHtmlCss(buildResult.css)}</style>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Component Preview</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>${themeStyles}${bundleStyles}
    <script type="importmap">
${importMapJson}
    </script>
  </head>
  <body class="${previewMode === "thumbnail" ? "min-h-screen overflow-hidden bg-white" : "min-h-screen bg-white"}">
    <div id="root"></div>
    <script type="module">
${buildResult.code}
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
