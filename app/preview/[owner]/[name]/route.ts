import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  getRegistryItemByOwnerNameAndVersion,
  getRegistryItemVersions,
  getCurrentVersion,
  toShadcnRegistryItem,
  getThemeEntryCss,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";
import { buildPreviewBundle } from "@/lib/preview-build";
import {
  buildPreviewCacheKey,
  buildPreviewWorkspaceKey,
  getPreviewBuildCache,
  hashFiles,
  setPreviewBuildCache,
  sha256,
  stableStringify,
} from "@/lib/preview-build-cache";
import {
  buildPreviewResolveCacheKey,
  getPreviewResolveCache,
  setPreviewResolveCache,
} from "@/lib/preview-resolve-cache";
import { extractDependencies } from "@/lib/validate-tsx";
import {
  collectThemeCssFromResolvedGraph,
  createRegistryResolverMemo,
  resolveRegistryDependencies,
} from "@/lib/registry-resolver";
import { materializeInstalledRegistryFilesFromResolvedGraph } from "@/lib/registry-install-layout";
import {
  RegistryDependencyCycleError,
  RegistryDependencyNotFoundError,
  RegistryDependencyPermissionDeniedError,
} from "@/lib/registry-dependency-errors";
import { db } from "@/lib/db";
import { registryItemVersions, registryPreviewArtifacts } from "@/lib/db/schema";
import { enqueuePreviewArtifactJob } from "@/lib/preview-artifact-jobs";

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

/** Semver-ish descending sort for version labels */
function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort((a, b) => {
    const pa = a.split(".").map((s) => parseInt(s, 10) || 0);
    const pb = b.split(".").map((s) => parseInt(s, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const da = pa[i] ?? 0;
      const db = pb[i] ?? 0;
      if (db !== da) return db - da;
    }
    return b.localeCompare(a);
  });
}

/**
 * Fixed bar with version &lt;select&gt; (default preview only). Navigates by updating `?v=`.
 */
function buildVersionToolbarHtml(
  effectiveVersion: string,
  versionOptions: string[],
  currentVersion: string,
  previewMode: string,
): string {
  if (previewMode === "thumbnail" || versionOptions.length <= 1) {
    return "";
  }
  const optionsHtml = versionOptions
    .map((v) => {
      const sel = v === effectiveVersion ? " selected" : "";
      const latestSuffix = v === currentVersion ? " (latest)" : "";
      return `<option value="${escapeHtml(v)}"${sel}>v${escapeHtml(v)}${escapeHtml(latestSuffix)}</option>`;
    })
    .join("");

  const latestJson = JSON.stringify(currentVersion);

  return `<div id="cozy-preview-version-bar" style="position:fixed;top:0;left:0;right:0;z-index:99999;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #e4e4e7;background:#fafafa;font:13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;color:#18181b;">
  <label for="cozy-preview-version" style="font-weight:600;white-space:nowrap;">Version</label>
  <select id="cozy-preview-version" style="flex:1;max-width:280px;padding:6px 10px;border-radius:8px;border:1px solid #d4d4d8;background:#fff;font:inherit;color:inherit;">
    ${optionsHtml}
  </select>
</div>
<script>
(function(){
  var sel = document.getElementById("cozy-preview-version");
  if (!sel) return;
  sel.addEventListener("change", function() {
    var u = new URL(window.location.href);
    var next = this.value;
    var latest = ${latestJson};
    if (next === latest) { u.searchParams.delete("v"); } else { u.searchParams.set("v", next); }
    window.location.href = u.toString();
  });
})();
</script>`;
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
    const key = candidate.toLowerCase();
    const value = vars.get(key);
    if (value) return { value, varName: candidate };
  }
  return { value: fallback, varName: candidates[0] ?? "--" };
}

function themeSwatchSection(color: string, varName: string) {
  return `<section style="position:relative;min-height:0;min-width:0;background:${escapeHtml(color)};">
      <div style="position:absolute;top:0;left:0;padding:10px 12px;font:600 11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:rgba(255,255,255,0.96);text-shadow:0 1px 2px rgba(0,0,0,0.55),0 0 10px rgba(0,0,0,0.2);max-width:calc(100% - 16px);word-break:break-word;">${escapeHtml(varName)}</div>
    </section>`;
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

type PreviewMode = "default" | "thumbnail";

function createTimingTracker() {
  const startedAt = performance.now();
  const entries: Record<string, number> = {};

  return {
    mark(label: string, from: number) {
      entries[label] = Math.round((performance.now() - from) * 100) / 100;
    },
    done(extra: Record<string, unknown>) {
      return {
        ...extra,
        timingsMs: {
          ...entries,
          total: Math.round((performance.now() - startedAt) * 100) / 100,
        },
      };
    },
  };
}

function hashResolvedRegistryGraph(
  ordered: Awaited<ReturnType<typeof resolveRegistryDependencies>>["ordered"],
) {
  const normalized = ordered.map(({ ref, item }) => ({
    ref: ref.ref,
    owner: ref.owner,
    name: ref.name,
    version: ref.version,
    type: item.type,
    currentVersion: item.currentVersion ?? null,
    registryDependencies: [...((item.registryDependencies ?? []) as string[])].sort(),
    meta:
      item.meta && typeof item.meta === "object"
        ? item.meta
        : null,
    files: (item.files ?? [])
      .map((file) => ({
        path: file.path,
        type: file.type,
        content: file.content,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }));

  return sha256(stableStringify(normalized));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const timings = createTimingTracker();
  const { owner, name } = await params;
  const url = new URL(request.url);
  const version = url.searchParams.get("v") ?? null;
  const debug = url.searchParams.get("debug") === "1";
  const debugTheme = debug || url.searchParams.get("debugTheme") === "1";
  const debugDeps = debug || url.searchParams.get("debugDeps") === "1";
  const previewMode: PreviewMode =
    url.searchParams.get("thumbnail") === "1" ? "thumbnail" : "default";

  let stepStartedAt = performance.now();
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? (await getUserIdFromToken(request));
  timings.mark("session", stepStartedAt);

  stepStartedAt = performance.now();
  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    version,
    userId,
  );
  timings.mark("rootItemLoad", stepStartedAt);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  stepStartedAt = performance.now();
  let versionOptions: string[] = [];
  try {
    const rows = await getRegistryItemVersions(owner, name, userId);
    versionOptions = rows.map((r) => r.version);
  } catch {
    versionOptions = [];
  }
  const currentVer = getCurrentVersion(item);
  const resolverMemo = createRegistryResolverMemo();
  if (versionOptions.length === 0) {
    versionOptions = [currentVer];
  } else if (!versionOptions.includes(currentVer)) {
    versionOptions.push(currentVer);
  }
  versionOptions = sortVersionsDesc([...new Set(versionOptions)]);
  timings.mark("versionListLoad", stepStartedAt);

  const effectiveVersion = version ?? currentVer;
  const versionToolbarHtml = buildVersionToolbarHtml(
    effectiveVersion,
    versionOptions,
    currentVer,
    previewMode,
  );
  const toolbarBodyPadding =
    versionToolbarHtml.length > 0 ? "padding-top:48px;" : "";

  let artifactHit = false;
  let artifactJsUrl: string | null = null;
  let artifactCssUrl: string | null = null;
  stepStartedAt = performance.now();
  try {
    const [itemVersion] = await db
      .select({ id: registryItemVersions.id })
      .from(registryItemVersions)
      .where(
        and(
          eq(registryItemVersions.itemId, item.id),
          eq(registryItemVersions.version, effectiveVersion),
        ),
      )
      .limit(1);
    if (itemVersion) {
      const [artifact] = await db
        .select({
          status: registryPreviewArtifacts.status,
          jsUrl: registryPreviewArtifacts.jsUrl,
          cssUrl: registryPreviewArtifacts.cssUrl,
        })
        .from(registryPreviewArtifacts)
        .where(
          and(
            eq(registryPreviewArtifacts.itemVersionId, itemVersion.id),
            eq(registryPreviewArtifacts.mode, previewMode),
          ),
        )
        .limit(1);
      if (artifact?.status === "ready" && artifact.jsUrl) {
        artifactHit = true;
        artifactJsUrl = artifact.jsUrl;
        artifactCssUrl = artifact.cssUrl ?? null;
      } else if (item.type !== "registry:theme") {
        await enqueuePreviewArtifactJob({
          itemId: item.id,
          itemVersionId: itemVersion.id,
          payload: {
            owner,
            name,
            version: effectiveVersion,
            mode: previewMode,
            requestUserId: userId ?? null,
          },
        });
      }
    }
  } catch {
    // non-blocking; fallback to inline build path
  }
  timings.mark("previewArtifactLookup", stepStartedAt);

  // Theme 条目：仅注入主题 CSS，展示简易预览页（STYLE_AND_THEME_SPEC §5.1 可选）
  if (item.type === "registry:theme") {
    const themeCss = getThemeEntryCss(item);
    const cssVars = parseCssVariables(themeCss);
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
    const pageBg =
      previewMode === "thumbnail" ? "transparent" : background.value;
    const html = `<!DOCTYPE html>
<html lang="en" style="${previewMode === "thumbnail" ? "background:transparent;" : ""}">
  <head>
    <meta charset="UTF-8" />
    <title>Theme: ${item.title ?? name}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>${escapeHtmlCss(themeCss)}</style>
  </head>
  <body style="min-height:100vh;margin:0;background:${escapeHtml(pageBg)};${toolbarBodyPadding}">
${versionToolbarHtml}
    <main style="display:grid;min-height:${versionToolbarHtml ? "calc(100vh - 48px)" : "100vh"};width:100%;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;overflow:hidden;">
      ${themeSwatchSection(primary.value, primary.varName)}
      ${themeSwatchSection(secondary.value, secondary.varName)}
      ${themeSwatchSection(accent.value, accent.varName)}
      ${themeSwatchSection(background.value, background.varName)}
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

  const itemMeta =
    item.meta && typeof item.meta === "object"
      ? (item.meta as Record<string, unknown>)
      : undefined;
  const rawPreviewProps = itemMeta?.previewProps;
  const rawPreviewExport = itemMeta?.previewExport;
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

  const previewExport =
    typeof rawPreviewExport === "string" && rawPreviewExport.trim()
      ? rawPreviewExport.trim()
      : undefined;

  const previewPropsHash = sha256(stableStringify(previewProps ?? {}));

  let componentDepSources: string[] = [];
  let themeSources: string[] = [];
  let themeCss = "";
  let registryGraphHash = "";
  let resolvedNodeCount = 1;
  let resolveCacheHit = false;

  try {
    const resolveCacheKey = buildPreviewResolveCacheKey({
      owner,
      name,
      version: effectiveVersion,
      requestUserId: userId ?? null,
    });
    const cachedResolved = getPreviewResolveCache(resolveCacheKey);

    if (cachedResolved) {
      resolveCacheHit = true;
      resolvedNodeCount = cachedResolved.resolvedNodeCount;
      componentDepSources = cachedResolved.componentDepSources;
      themeSources = cachedResolved.themeSources;
      themeCss = cachedResolved.themeCss;
      registryGraphHash = cachedResolved.registryGraphHash;
      for (const key of Object.keys(files)) {
        delete files[key];
      }
      for (const [p, c] of Object.entries(cachedResolved.files)) {
        files[p] = c;
      }
      timings.mark("dependencyResolution", stepStartedAt);
      timings.mark("componentMaterialization", stepStartedAt);
      timings.mark("themeCssDerivation", stepStartedAt);
    } else {
      stepStartedAt = performance.now();
      const resolvedGraph = await resolveRegistryDependencies({
        owner,
        name,
        version,
        requestUserId: userId,
        memo: resolverMemo,
      });
      resolvedNodeCount = resolvedGraph.ordered.length;
      timings.mark("dependencyResolution", stepStartedAt);

      stepStartedAt = performance.now();
      const installedLayout = materializeInstalledRegistryFilesFromResolvedGraph(
        resolvedGraph.ordered,
      );
      const rootRef =
        resolvedGraph.ordered[resolvedGraph.ordered.length - 1]?.ref.ref ?? null;
      componentDepSources = installedLayout.sources.filter(
        (ref) => ref !== rootRef,
      );
      for (const key of Object.keys(files)) {
        delete files[key];
      }
      for (const [p, c] of Object.entries(installedLayout.files)) {
        files[p] = c;
      }
      if (rootRef) {
        const rootEntry = installedLayout.rootEntries[rootRef];
        if (rootEntry) {
          files["index.tsx"] =
            `export { default } from "./${rootEntry}";\nexport * from "./${rootEntry}";\n`;
        }
      }
      timings.mark("componentMaterialization", stepStartedAt);

      stepStartedAt = performance.now();
      const resolvedTheme = collectThemeCssFromResolvedGraph(resolvedGraph.ordered);
      themeSources = resolvedTheme.sources;
      themeCss = resolvedTheme.css;
      timings.mark("themeCssDerivation", stepStartedAt);

      registryGraphHash = hashResolvedRegistryGraph(resolvedGraph.ordered);
      setPreviewResolveCache(resolveCacheKey, {
        files: { ...files },
        componentDepSources: [...componentDepSources],
        themeSources: [...themeSources],
        themeCss,
        registryGraphHash,
        resolvedNodeCount,
      });
    }
  } catch (err) {
    const code =
      err instanceof RegistryDependencyPermissionDeniedError
        ? "REGDEP_PERMISSION_DENIED"
        : err instanceof RegistryDependencyNotFoundError
          ? "REGDEP_NOT_FOUND"
          : err instanceof RegistryDependencyCycleError
            ? "REGDEP_CYCLE_DETECTED"
            : "PREVIEW_COMPONENT_DEP_RESOLVE_FAILED";
    const message = err instanceof Error ? err.message : String(err);
    const cyclePath =
      err instanceof RegistryDependencyCycleError ? err.path : undefined;
    const html = `<!DOCTYPE html>
<html lang="en" style="${previewMode === "thumbnail" ? "background:transparent;" : ""}">
  <head>
    <meta charset="UTF-8" />
    <title>Preview dependency error</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;background:#fef2f2;color:#b91c1c;">
    <h1 style="font-size:16px;margin:0 0 8px;">Registry dependency resolution failed</h1>
    <p style="font-size:13px;margin:0 0 8px;"><strong>${escapeHtml(code)}</strong></p>
    <pre style="white-space:pre-wrap;font-size:13px;background:#fff;border-radius:8px;border:1px solid #fecaca;padding:12px;color:#991b1b;">${escapeHtml(message)}${cyclePath ? "\n\n" + escapeHtml(cyclePath.join(" -> ")) : ""}</pre>
  </body>
</html>`;
    return new NextResponse(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 运行时依赖来源：
  // - 存储在 DB 中的 item.dependencies（兼容旧数据）
  // - 从安装布局模拟后的源码文件中动态提取的 bare imports
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
  const rootFilesHash = hashFiles(files);
  const runtimeDepsHash = sha256(stableStringify(runtimeDependencies));

  const cacheKeySummary = {
    owner,
    name,
    version: effectiveVersion,
    mode: previewMode,
    debug,
    rootFilesHash,
    previewExport: previewExport ?? null,
    previewPropsHash,
    runtimeDepsHash,
    registryGraphHash,
  } as const;
  const previewCacheKey = buildPreviewCacheKey(cacheKeySummary);
  const previewWorkspaceKey = buildPreviewWorkspaceKey({
    owner,
    name,
    version: effectiveVersion,
    mode: previewMode,
    debug,
    rootFilesHash,
    previewExport: previewExport ?? null,
    runtimeDepsHash,
    registryGraphHash,
  });

  stepStartedAt = performance.now();
  const cachedPreview = getPreviewBuildCache(previewCacheKey);
  timings.mark("previewCacheLookup", stepStartedAt);

  let cacheHit = false;
  let buildCode: string;
  let buildCss: string | undefined;

  if (artifactHit && artifactJsUrl) {
    buildCode = `import ${JSON.stringify(artifactJsUrl)};`;
    buildCss = undefined;
  } else if (cachedPreview) {
    cacheHit = true;
    buildCode = cachedPreview.build.code;
    buildCss = cachedPreview.build.css;
    themeCss = cachedPreview.themeCss;
    themeSources = cachedPreview.themeSources;
    componentDepSources = cachedPreview.componentDepSources;
  } else {
    stepStartedAt = performance.now();
    const buildResult = await buildPreviewBundle(
      {
        name: item.name,
        version: version ?? item.currentVersion ?? "0.1.0",
        files,
        // 传给 esbuild，用于 external 出所有运行时依赖
        dependencies: runtimeDependencies,
        previewExport,
      },
      previewProps,
      { mode: previewMode, workspaceKey: previewWorkspaceKey, debug },
    );
    timings.mark("previewBuildExecution", stepStartedAt);

    if (!buildResult.ok) {
      const err = buildResult.error;
      const details =
        err.file && err.line != null
          ? `${err.file}:${err.line}:${err.column ?? 0}`
          : "";
      const html = `<!DOCTYPE html>
<html lang="en" style="${previewMode === "thumbnail" ? "background:transparent;" : ""}">
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

    buildCode = buildResult.code;
    buildCss = buildResult.css;
    setPreviewBuildCache(previewCacheKey, {
      build: { code: buildCode, css: buildCss },
      themeCss,
      themeSources,
      componentDepSources,
      cacheKeySummary: { ...cacheKeySummary },
    });
  }

  // 根据环境切换 React dev / prod 版本
  const isDev =
    previewMode === "default" || process.env.NODE_ENV !== "production" || debug;

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

  const themeResolveError: string | null = null;
  const themeStyles =
    themeCss.trim().length > 0
      ? `\n    <style>${escapeHtmlCss(themeCss)}</style>`
      : "";
  const themeDebug =
    debugTheme
      ? JSON.stringify(
          {
            owner,
            name,
            requestedVersion: version,
            registryDependencies: (item.registryDependencies ?? []) as string[],
            resolvedThemeSources: themeSources,
            injected: themeStyles.trim().length > 0,
            resolveError: themeResolveError,
          },
          null,
          2,
        )
      : "";
  const themeDebugScript = debugTheme
    ? `\n    <script>\nwindow.__COZY_THEME_DEBUG__ = ${themeDebug};\nconsole.info("[preview:theme-debug]", window.__COZY_THEME_DEBUG__);\n</script>`
    : "";
  const depsDebug =
    debugDeps
      ? JSON.stringify(
          {
            owner,
            name,
            requestedVersion: version,
            registryDependencies: (item.registryDependencies ?? []) as string[],
            materializedComponentDepSources: componentDepSources,
            themeResolveError,
            resolvedThemeSources: themeSources,
            previewCache: {
              hit: cacheHit,
              key: previewCacheKey,
              keySummary: cacheKeySummary,
            },
            resolveCache: {
              hit: resolveCacheHit,
              key: buildPreviewResolveCacheKey({
                owner,
                name,
                version: effectiveVersion,
                requestUserId: userId ?? null,
              }),
            },
            resolverMemo: {
              accessEntries: resolverMemo.access.size,
              itemEntries: resolverMemo.item.size,
            },
            timings: timings.done({}),
          },
          null,
          2,
        )
      : "";
  const depsDebugScript = debugDeps
    ? `\n    <script>\nwindow.__COZY_DEPS_DEBUG__ = ${depsDebug};\nconsole.info("[preview:deps-debug]", window.__COZY_DEPS_DEBUG__);\n</script>`
    : "";
  const diagnosticsPanel = debug
    ? `\n    <details open style="position:fixed;right:16px;bottom:16px;z-index:99999;max-width:min(560px,calc(100vw - 32px));border:1px solid #d4d4d8;border-radius:14px;background:rgba(255,255,255,0.96);box-shadow:0 18px 48px rgba(0,0,0,0.18);backdrop-filter:blur(10px);">
      <summary style="cursor:pointer;list-style:none;padding:12px 14px;font:600 12px/1.4 system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;color:#18181b;">Preview diagnostics</summary>
      <pre style="margin:0;padding:0 14px 14px;max-height:min(42vh,420px);overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#27272a;">${escapeHtml(
        JSON.stringify(
          {
            owner,
            name,
            version: effectiveVersion,
            mode: previewMode,
            debug,
            cacheHit,
            resolveCacheHit,
            previewCacheKey,
            previewWorkspaceKey,
            resolvedNodeCount,
            runtimeDependencies,
            componentDepSources,
            themeSources,
            timings: timings.done({}),
          },
          null,
          2,
        ),
      )}</pre>
    </details>`
    : "";
  const bundleStyles =
    artifactCssUrl != null && artifactCssUrl !== ""
      ? `\n    <link rel="stylesheet" href="${escapeHtml(artifactCssUrl)}" />`
      : buildCss != null && buildCss !== ""
        ? `\n    <style>${escapeHtmlCss(buildCss)}</style>`
        : "";

  console.info(
    "[preview] request",
    timings.done({
      owner,
      name,
      version: effectiveVersion,
      mode: previewMode,
      artifactHit,
      cacheHit,
      resolveCacheHit,
      cacheKey: previewCacheKey,
      resolvedNodes: resolvedNodeCount,
      resolverMemoAccessEntries: resolverMemo.access.size,
      resolverMemoItemEntries: resolverMemo.item.size,
      materializedFiles: Object.keys(files).length,
      runtimeBareDependencies: runtimeDependencies.length,
      debug,
    }),
  );

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
  <body class="${previewMode === "thumbnail" ? "min-h-screen overflow-hidden bg-transparent" : "min-h-screen bg-white"}" style="${previewMode === "thumbnail" ? "background:transparent;" : ""}${toolbarBodyPadding}">
${versionToolbarHtml}
    <div id="root"></div>
${themeDebugScript}${depsDebugScript}${diagnosticsPanel}
    <script type="module">
${buildCode}
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
