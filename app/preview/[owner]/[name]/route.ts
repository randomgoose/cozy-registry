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

/** 解析 registryDependencies 项，如 "@owner/name" 或 "@owner/name@1.0.0" */
function parseRegistryDep(dep: string): { owner: string; name: string; version: string | null } | null {
  const m = dep.trim().match(/^@([^/@]+)\/([^@]+)(?:@(.+))?$/);
  if (!m) return null;
  return { owner: m[1], name: m[2], version: m[3] ?? null };
}

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
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Theme: ${item.title ?? name}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>${escapeHtmlCss(themeCss)}</style>
  </head>
  <body class="min-h-screen bg-white p-8 font-sans">
    <h1 class="text-lg font-semibold text-gray-900">Theme: ${escapeHtml(item.title ?? name)}</h1>
    <p class="mt-2 text-sm text-gray-600">CSS variables are loaded. Use this theme as a registryDependency in components.</p>
    <div class="mt-6 flex gap-4 flex-wrap">
      <div class="h-16 w-32 rounded-lg shadow" style="background: var(--color-primary, #2563eb);"></div>
      <div class="h-16 w-32 rounded-lg shadow" style="background: var(--color-primary-hover, #1d4ed8);"></div>
      <div class="h-16 w-32 rounded-lg border border-gray-300" style="border-radius: var(--radius-md, 0.5rem);"></div>
    </div>
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

  const rawPreviewProps = (item as any)?.meta?.previewProps;
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

  // 按 SPEC §5.1：先注入依赖的 theme CSS（Tailwind 之后、preview.js 之前）
  const registryDeps = (item.registryDependencies ?? []) as string[];
  const seenThemeKey = new Set<string>();
  const themeCssChunks: string[] = [];
  for (const dep of registryDeps) {
    const parsed = parseRegistryDep(dep);
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.name}`;
    if (seenThemeKey.has(key)) continue;
    const depItem = await getRegistryItemByOwnerNameAndVersion(
      parsed.owner,
      parsed.name,
      parsed.version,
      userId,
    );
    if (!depItem || depItem.type !== "registry:theme") continue;
    seenThemeKey.add(key);
    const css = getThemeEntryCss(depItem);
    if (css) themeCssChunks.push(css);
  }
  const themeStyles =
    themeCssChunks.length > 0
      ? `\n    <style>${escapeHtmlCss(themeCssChunks.join("\n\n"))}</style>`
      : "";
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
  <body class="min-h-screen bg-white">
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
