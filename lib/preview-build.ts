import fs from "fs/promises";
import os from "os";
import path from "path";
import Module from "node:module";
import { createHash } from "node:crypto";
import {
  PREVIEW_MSG_INITIAL_PROPS,
  PREVIEW_MSG_RUNTIME_ERROR,
  PREVIEW_MSG_SET_PROPS,
} from "@/lib/preview-messages";
import type { PreviewDependencyResolutionDiagnostic } from "@/lib/preview-dependency-provider";
import { resolveBundleRootAliasImport } from "@/lib/module-specifiers";

type EsbuildModule = typeof import("esbuild");

type ComponentBundle = {
  name: string;
  version: string;
  files: Record<string, string>;
  dependencies?: string[];
  /**
   * 可选：强制用于预览的命名导出（来自 registry meta.previewExport）。
   * 优先级高于 default，用于仅有命名导出或 default 非组件时。
   */
  previewExport?: string | null;
};

/** slug / kebab → PascalCase，如 gate-button → GateButton */
function slugToPascalExportName(slug: string): string {
  return slug
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((s) => (s[0] ? s[0].toUpperCase() + s.slice(1) : ""))
    .join("");
}

/** slug / kebab → camelCase，如 gate-button → gateButton；button → button */
function slugToCamelExportName(slug: string): string {
  const parts = slug.split(/[^a-zA-Z0-9]/).filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  const head = first ? first[0].toLowerCase() + first.slice(1) : "";
  const tail = rest
    .map((p) => (p[0] ? p[0].toUpperCase() + p.slice(1) : ""))
    .join("");
  return head + tail;
}

/**
 * 从源码中推断应用作 default 再导出的 PascalCase 符号（无 index.tsx 时的合成入口）。
 * 覆盖：`export { GateButton, gateButtonVariants }`、`export function Foo` 等；
 * 不覆盖仅有 `export type` / `export { type X }` 中可擦除的名字。
 */
function pickSyntheticDefaultExportName(source: string): string | null {
  const exportBlocks = /export\s*\{([^}]+)\}/g;
  let block: RegExpExecArray | null;
  while ((block = exportBlocks.exec(source)) !== null) {
    const segments = block[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      if (/^type\s+/i.test(seg)) continue;
      const id = seg.match(/^([A-Z][A-Za-z0-9_]*)\b/);
      if (id) return id[1];
    }
  }
  const exportFn = source.match(
    /export\s+function\s+([A-Z][A-Za-z0-9_]*)\b/,
  );
  if (exportFn) return exportFn[1];
  const exportClass = source.match(
    /export\s+class\s+([A-Z][A-Za-z0-9_]*)\b/,
  );
  if (exportClass) return exportClass[1];
  const exportConst = source.match(
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\b/,
  );
  if (exportConst) return exportConst[1];
  return null;
}

/**
 * bundle 无 index 时选择入口 TS/TSX：优先路径含组件 slug，其次含 default / 命名导出组件 的源码。
 */
function pickPreviewEntrySourcePath(
  files: Record<string, string>,
  bundleName: string,
): string | null {
  const jsLike = Object.keys(files).filter((p) =>
    /\.(tsx|ts|jsx|js)$/.test(p),
  );
  if (jsLike.length === 0) return null;

  const slug = bundleName.trim().toLowerCase();
  const slugParts = slug.split(/[^a-z0-9]+/).filter(Boolean);
  const slugHyphen = slugParts.join("-");

  const pathScore = (p: string): number => {
    const lower = p.toLowerCase().replace(/\\/g, "/");
    if (slugHyphen && lower.includes(slugHyphen)) return 100;
    if (
      slugParts.length > 0 &&
      slugParts.every((part) => part.length > 0 && lower.includes(part))
    ) {
      return 50;
    }
    return 0;
  };

  const sourceScore = (src: string): number => {
    let s = 0;
    if (/export\s+default\b/.test(src)) s += 5;
    if (/export\s*\{[^}]*\b[A-Z][A-Za-z0-9_]*/.test(src)) s += 3;
    if (
      /export\s+function\s+[A-Z]/.test(src) ||
      /export\s+class\s+[A-Z]/.test(src)
    ) {
      s += 3;
    }
    if (/function\s+[A-Z][A-Za-z0-9_]*\s*[\({]/.test(src)) s += 1;
    return s;
  };

  const ranked = jsLike.map((p) => ({
    p,
    score: pathScore(p) + sourceScore(files[p] ?? ""),
  }));
  ranked.sort((a, b) => b.score - a.score || a.p.localeCompare(b.p));
  return ranked[0]?.p ?? null;
}

export type PreviewBuildResult =
  | {
      ok: true;
      code: string;
      css?: string;
      dependencyResolutionDiagnostics?: PreviewDependencyResolutionDiagnostic[];
    }
  | {
      ok: false;
      error: {
        message: string;
        file?: string;
        line?: number;
        column?: number;
      };
    };

type PreviewWorkspaceState = {
  dir: string;
  fileHashes: Map<string, string>;
};

const previewWorkspaceRoot = path.join(
  os.tmpdir(),
  "cozy-registry-preview-workspaces",
);
const previewWorkspaceStates = new Map<string, PreviewWorkspaceState>();

/**
 * Build a browser-ready ESM preview bundle from a ComponentBundle.
 * Uses a temporary on-disk project and esbuild, following the
 * high-level flow from docs/COMPONENT_PREVIEW_RUNTIME.md.
 */
export async function buildPreviewBundle(
  bundle: ComponentBundle,
  previewProps: unknown,
  options?: {
    mode?: "default" | "thumbnail";
    workspaceKey?: string;
    debug?: boolean;
    externalizeDependencies?: boolean;
    dependencyNodePaths?: string[];
    dependencyResolutionDiagnostics?: PreviewDependencyResolutionDiagnostic[];
  },
): Promise<PreviewBuildResult> {
  // 注意：为了避免 Next.js 在服务器 bundle 时把 esbuild 的可执行文件等一起打包，
  // 我们只在运行时动态引入它，而不是作为顶层静态依赖。
  // 这有助于绕过 Turbopack 对 README / bin 等非 JS 资源的解析问题。
  const esbuild: EsbuildModule = await import("esbuild");

  const workspace = await getPreviewWorkspace(options?.workspaceKey);
  const tmpDir = workspace.dir;

  try {
    const desiredFiles = new Map<string, string>(
      Object.entries(bundle.files).map(([relPath, content]) => [
        normalizeWorkspacePath(relPath),
        content,
      ]),
    );

    // Ensure an index.tsx entry file exists. If not, create a shallow wrapper
    // that re-exports a sensible default from the first TSX file:
    // - 优先使用已有的 export default
    // - 其次使用约定的 PreviewComponent
    // - 否则使用首个导出的组件名（大写开头）
    if (!("index.tsx" in bundle.files)) {
      const entrySourcePath =
        pickPreviewEntrySourcePath(bundle.files, bundle.name) ??
        Object.keys(bundle.files).find((p) => /\.(tsx|jsx)$/.test(p)) ??
        Object.keys(bundle.files).find((p) => /\.(ts|js)$/.test(p)) ??
        Object.keys(bundle.files)[0];

      if (!entrySourcePath) {
        return {
          ok: false,
          error: { message: "Component bundle has no files" },
        };
      }

      const importPath = `./${entrySourcePath.replace(/\.(tsx?|jsx?)$/, "")}`;
      const source = bundle.files[entrySourcePath] ?? "";

      let indexContent: string;

      if (/export\s+default\b/.test(source)) {
        // 源文件本身已有默认导出，直接转 re-export，避免重复命名
        indexContent = `export { default } from "${importPath}";\n`;
      } else if (
        /export\s+(?:const|function|class)\s+PreviewComponent\b/.test(source)
      ) {
        indexContent = `export { PreviewComponent as default } from "${importPath}";\n`;
      } else {
        const pickedName =
          pickSyntheticDefaultExportName(source) ||
          slugToPascalExportName(bundle.name) ||
          "Component";
        indexContent = `export { ${pickedName} as default } from "${importPath}";\n`;
      }

      desiredFiles.set("index.tsx", indexContent);
    }

    // Generate preview-entry.tsx that renders the default export with props.
    let serializedProps = "{}";
    try {
      serializedProps = JSON.stringify(previewProps ?? {});
    } catch {
      serializedProps = "{}";
    }

    const mode = options?.mode === "thumbnail" ? "thumbnail" : "default";
    const debugEnabled = options?.debug === true;
    const externalizeDependencies = options?.externalizeDependencies !== false;
    const previewHints = JSON.stringify({
      previewExport:
        typeof bundle.previewExport === "string" && bundle.previewExport.trim()
          ? bundle.previewExport.trim()
          : null,
      pascal: slugToPascalExportName(bundle.name),
      camel: slugToCamelExportName(bundle.name),
    });
    const previewEntryContent = `import React from "react";
import { createRoot } from "react-dom/client";
import * as Mod from "./index";

const COZY_PREVIEW_INITIAL = ${JSON.stringify(PREVIEW_MSG_INITIAL_PROPS)};
const COZY_PREVIEW_SET = ${JSON.stringify(PREVIEW_MSG_SET_PROPS)};
const COZY_PREVIEW_RUNTIME_ERROR = ${JSON.stringify(PREVIEW_MSG_RUNTIME_ERROR)};
const DEBUG_ENABLED = ${JSON.stringify(debugEnabled)};

const PREVIEW_HINTS = ${previewHints};

function cozyIsRenderableExport(v) {
  if (v == null) return false;
  if (typeof v === "function") return true;
  if (typeof v === "object" && "$$typeof" in v) return true;
  return false;
}

function cozyResolvePreviewComponent(Mod, hints) {
  var tryKey = function (key) {
    if (key == null || key === "") return null;
    var v = Mod[key];
    return cozyIsRenderableExport(v) ? v : null;
  };

  var chain = [
    function () {
      return tryKey(hints.previewExport);
    },
    function () {
      return cozyIsRenderableExport(Mod.default) ? Mod.default : null;
    },
    function () {
      return tryKey(hints.pascal);
    },
    function () {
      return tryKey(hints.camel);
    },
    function () {
      return tryKey("PreviewComponent");
    },
  ];

  for (var i = 0; i < chain.length; i++) {
    var picked = chain[i]();
    if (cozyIsRenderableExport(picked)) return picked;
  }

  var keys = Object.keys(Mod);
  var pascalLike = keys
    .filter(function (k) {
      return (
        k !== "default" &&
        k !== "__esModule" &&
        /^[A-Z][A-Za-z0-9]*$/.test(k)
      );
    })
    .sort();
  for (var pi = 0; pi < pascalLike.length; pi++) {
    var pv = tryKey(pascalLike[pi]);
    if (pv) return pv;
  }

  var utilityExact = {
    cn: 1,
    cx: 1,
    cva: 1,
    tv: 1,
    tw: 1,
    twMerge: 1,
    clsx: 1,
    classNames: 1,
  };
  var utilitySuffix =
    /(?:[Vv]ariants|[Pp]rops|[Ss]chema|[Cc]onfig|[Cc]ontext|[Tt]heme|[Ss]tyles?)$/;

  var rest = keys
    .filter(function (k) {
      return (
        k !== "default" &&
        k !== "__esModule" &&
        pascalLike.indexOf(k) === -1 &&
        !utilityExact[k] &&
        !utilitySuffix.test(k)
      );
    })
    .sort();
  for (var ri = 0; ri < rest.length; ri++) {
    var rv = tryKey(rest[ri]);
    if (rv) return rv;
  }

  return null;
}

function cozyToErrorLike(error) {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

function cozyReportToParent(payload) {
  try {
    const targetOrigin = window.location.origin;
    window.parent.postMessage(
      { type: COZY_PREVIEW_RUNTIME_ERROR, payload: payload },
      targetOrigin && targetOrigin !== "null" ? targetOrigin : "*",
    );
  } catch {
    try {
      window.parent.postMessage(
        { type: COZY_PREVIEW_RUNTIME_ERROR, payload: payload },
        "*",
      );
    } catch {
      // ignore
    }
  }
}

function cozyRenderRuntimeError(payload) {
  var existing = document.getElementById("cozy-preview-runtime-error");
  if (existing) existing.remove();
  var host = document.createElement("div");
  host.id = "cozy-preview-runtime-error";
  host.setAttribute(
    "style",
    [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "overflow:auto",
      "background:rgba(17,24,39,0.9)",
      "padding:24px",
      "box-sizing:border-box",
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      "color:#f9fafb",
    ].join(";"),
  );
  var stack = payload.stack ? "\\n\\n" + payload.stack : "";
  var componentStack = payload.componentStack
    ? "\\n\\nComponent stack:\\n" + payload.componentStack
    : "";
  var hint = payload.debugEnabled
    ? ""
    : "\\n\\nTip: reopen this preview with ?debug=1 for dev React and richer diagnostics.";
  host.innerHTML =
    '<div style="max-width:960px;margin:0 auto;border:1px solid rgba(248,113,113,0.55);background:rgba(127,29,29,0.32);border-radius:16px;padding:18px 20px;box-shadow:0 12px 30px rgba(0,0,0,0.35)">' +
    '<div style="font:600 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin-bottom:10px;color:#fecaca">Preview runtime failed</div>' +
    '<div style="font:500 12px/1.5 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin-bottom:14px;color:#fca5a5">Phase: ' +
    String(payload.phase) +
    "</div>" +
    '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff">' +
    String(payload.message || "Unknown preview runtime error") +
    stack +
    componentStack +
    hint +
    "</pre>" +
    "</div>";
  document.body.appendChild(host);
}

function cozyHandleRuntimeError(phase, rawError, extra) {
  var error = cozyToErrorLike(rawError);
  var payload = {
    phase: phase,
    message: error.message || String(rawError),
    stack: typeof error.stack === "string" ? error.stack : null,
    componentStack:
      extra && typeof extra.componentStack === "string"
        ? extra.componentStack
        : null,
    debugEnabled: DEBUG_ENABLED,
  };
  console.error("[preview-runtime]", phase, error, extra || null);
  cozyRenderRuntimeError(payload);
  cozyReportToParent(payload);
}

window.addEventListener("error", function (event) {
  cozyHandleRuntimeError("window-error", event.error || event.message, null);
});

window.addEventListener("unhandledrejection", function (event) {
  cozyHandleRuntimeError("unhandledrejection", event.reason, null);
});

var Component = cozyResolvePreviewComponent(Mod, PREVIEW_HINTS);

if (!cozyIsRenderableExport(Component)) {
  throw new Error("No suitable component export found from ./index for preview");
}

const INITIAL_PROPS = ${serializedProps} as Record<string, unknown>;

function App() {
  const mode = ${JSON.stringify(mode)};
  const isThumbnail = mode === "thumbnail";
  const [props, setProps] = React.useState<Record<string, unknown>>(INITIAL_PROPS);

  React.useEffect(() => {
    if (isThumbnail) return;
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window.parent) return;
      if (!ev.data || typeof ev.data !== "object") return;
      if ((ev.data as { type?: string }).type !== COZY_PREVIEW_SET) return;
      const next = (ev.data as { props?: unknown }).props;
      if (!next || typeof next !== "object" || Array.isArray(next)) return;
      setProps(next as Record<string, unknown>);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isThumbnail]);

  React.useEffect(() => {
    if (isThumbnail) return;
    try {
      const targetOrigin = window.location.origin;
      window.parent.postMessage(
        { type: COZY_PREVIEW_INITIAL, props: INITIAL_PROPS },
        targetOrigin && targetOrigin !== "null"
          ? targetOrigin
          : "*",
      );
    } catch {
      try {
        window.parent.postMessage(
          { type: COZY_PREVIEW_INITIAL, props: INITIAL_PROPS },
          "*",
        );
      } catch {
        // ignore
      }
    }
  }, [isThumbnail]);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        padding: isThumbnail ? 0 : 24,
        boxSizing: "border-box",
        display: "flex",
        justifyContent: "center",
        alignItems: isThumbnail ? "flex-start" : "center",
        overflow: "hidden",
        background: isThumbnail ? "transparent" : undefined,
      }}
    >
      <div
        data-cozy-preview-content
        style={{
          width: "100%",
          maxWidth: "100%",
          margin: "0 auto",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          data-cozy-preview-subject
          style={{
            width: "fit-content",
            maxWidth: isThumbnail ? "none" : "100%",
            transform: isThumbnail ? "scale(1.18)" : "none",
            transformOrigin: "top center",
          }}
        >
          <Component {...props} />
        </div>
      </div>
    </div>
  );
}

class PreviewRuntimeBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error: cozyToErrorLike(error) };
  }

  componentDidCatch(error, info) {
    cozyHandleRuntimeError("render", error, {
      componentStack:
        info && typeof info.componentStack === "string"
          ? info.componentStack
          : null,
    });
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element for preview runtime");
}

const root = createRoot(container);
root.render(
  <PreviewRuntimeBoundary>
    <App />
  </PreviewRuntimeBoundary>,
);
`;

    desiredFiles.set("preview-entry.tsx", previewEntryContent);
    await syncWorkspaceFiles(workspace, desiredFiles);
    const previewEntryPath = path.join(tmpDir, "preview-entry.tsx");

    // 收集组件 bundle 内 import 的 .css 文件，单独产出供 Preview 注入（STYLE_AND_THEME_SPEC §3.2）
    const collectedCss: string[] = [];
    const cssPlugin: import("esbuild").Plugin = {
      name: "extract-css",
      setup(build: import("esbuild").PluginBuild) {
        build.onLoad({ filter: /\.css$/ }, async (args: import("esbuild").OnLoadArgs) => {
          try {
            const content = await fs.readFile(args.path, "utf8");
            collectedCss.push(content);
            // 返回空模块，避免 esbuild 报错且不把 CSS 打进 JS
            return { contents: "export {}", loader: "js" };
          } catch {
            return null; // 交给 esbuild 默认处理
          }
        });
      },
    };

    // Figma Make 的资源引用（figma:asset/...）只在其运行时可用。
    // Preview 环境下将其替换为一个空字符串，保证组件仍可渲染（背景图等会缺失但不阻塞）。
    const figmaAssetPlugin: import("esbuild").Plugin = {
      name: "figma-asset-stub",
      setup(build: import("esbuild").PluginBuild) {
        build.onResolve({ filter: /^figma:asset\// }, (args: import("esbuild").OnResolveArgs) => {
          return {
            path: args.path,
            namespace: "figma-asset",
          };
        });
        build.onLoad({ filter: /.*/, namespace: "figma-asset" }, (args: import("esbuild").OnLoadArgs) => {
          const safe = JSON.stringify(args.path);
          return {
            contents: `export default ""; export const __figmaAsset = ${safe};\n`,
            loader: "js",
          };
        });
      },
    };
    const bundleAliasPlugin: import("esbuild").Plugin = {
      name: "bundle-root-alias",
      setup(build: import("esbuild").PluginBuild) {
        build.onResolve({ filter: /^@\// }, async (args: import("esbuild").OnResolveArgs) => {
          const resolved = await resolveBundleRootAliasPath(
            tmpDir,
            args.importer,
            args.path,
          );
          if (!resolved) {
            return {
              errors: [{ text: `Could not resolve ${JSON.stringify(args.path)}` }],
            };
          }
          return { path: resolved };
        });
      },
    };

    const previewNodePaths = resolvePreviewNodePaths(
      options?.dependencyNodePaths,
    );

    // Run esbuild to bundle the preview entry into a single ESM file.
    const result = await esbuild.build({
      entryPoints: [previewEntryPath],
      bundle: true,
      format: "esm",
      platform: "browser",
      jsx: "automatic",
      outfile: "preview.js",
      target: ["es2018"],
      sourcemap: debugEnabled ? "inline" : false,
      plugins: [bundleAliasPlugin, cssPlugin, figmaAssetPlugin],
      nodePaths: previewNodePaths,
      // React 相关始终由 runtime import map 提供
      external: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        // 默认将依赖 external 给 import map（与浏览器 ESM + import map 一致；勿内联 CJS 子依赖）
        ...(externalizeDependencies ? (bundle.dependencies ?? []) : []),
      ],
      logLevel: "silent",
      write: false,
    });

    const output = result.outputFiles?.[0]?.text;
    if (!output) {
      return {
        ok: false,
        error: { message: "Failed to generate preview bundle" },
      };
    }

    const css =
      collectedCss.length > 0 ? collectedCss.join("\n\n") : undefined;
    return {
      ok: true,
      code: output,
      css,
      dependencyResolutionDiagnostics: options?.dependencyResolutionDiagnostics,
    };
  } catch (err) {
    if (isEsbuildBuildError(err)) {
      const first = err.errors[0];
      return {
        ok: false,
        error: {
          message:
            first?.text ??
            (err instanceof Error ? err.message : String(err)),
          file: first?.location?.file,
          line: first?.location?.line,
          column: first?.location?.column,
        },
      };
    }

    return {
      ok: false,
      error: {
        message: err instanceof Error ? err.message : String(err),
      },
    };
  } finally {
    if (!options?.workspaceKey) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

type EsbuildBuildErrorLike = {
  errors: Array<{
    text?: string;
    location?: { file?: string; line?: number; column?: number };
  }>;
};

function isEsbuildBuildError(err: unknown): err is EsbuildBuildErrorLike {
  if (!err || typeof err !== "object") return false;
  const rec = err as Record<string, unknown>;
  if (!Array.isArray(rec.errors)) return false;
  return true;
}

async function resolveBundleRootAliasPath(
  workspaceRoot: string,
  importerPath: string | undefined,
  specifier: string,
): Promise<string | null> {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const realWorkspaceRoot = await safeRealpath(normalizedWorkspaceRoot);
  const candidateRoots = new Set<string>([
    normalizedWorkspaceRoot,
    realWorkspaceRoot,
  ]);

  if (importerPath) {
    let current = await safeRealpath(path.resolve(path.dirname(importerPath)));
    while (
      current.startsWith(normalizedWorkspaceRoot) ||
      current.startsWith(realWorkspaceRoot)
    ) {
      candidateRoots.add(current);
      if (current === normalizedWorkspaceRoot || current === realWorkspaceRoot) break;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  for (const root of candidateRoots) {
    for (const candidate of resolveBundleRootAliasImport(specifier)) {
      const abs = path.join(root, candidate);
      try {
        const stat = await fs.stat(abs);
        if (stat.isFile()) return abs;
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function safeRealpath(target: string) {
  try {
    return await fs.realpath(target);
  } catch {
    return target;
  }
}

async function getPreviewWorkspace(
  workspaceKey?: string,
): Promise<PreviewWorkspaceState> {
  if (!workspaceKey) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cozy-registry-preview-"));
    return {
      dir,
      fileHashes: new Map(),
    };
  }

  const existing = previewWorkspaceStates.get(workspaceKey);
  if (existing) return existing;

  const dir = path.join(previewWorkspaceRoot, workspaceKey);
  await fs.mkdir(dir, { recursive: true });
  const created = {
    dir,
    fileHashes: new Map<string, string>(),
  };
  previewWorkspaceStates.set(workspaceKey, created);
  return created;
}

async function syncWorkspaceFiles(
  workspace: PreviewWorkspaceState,
  desiredFiles: Map<string, string>,
) {
  await fs.mkdir(workspace.dir, { recursive: true });

  for (const [relPath, content] of desiredFiles) {
    const nextHash = hashContent(content);
    const prevHash = workspace.fileHashes.get(relPath);
    if (prevHash === nextHash) continue;

    const filePath = path.join(workspace.dir, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    workspace.fileHashes.set(relPath, nextHash);
  }

  for (const relPath of [...workspace.fileHashes.keys()]) {
    if (desiredFiles.has(relPath)) continue;
    const filePath = path.join(workspace.dir, relPath);
    await fs.rm(filePath, { force: true }).catch(() => {});
    workspace.fileHashes.delete(relPath);
  }
}

function normalizeWorkspacePath(relPath: string) {
  return relPath.replace(/^\/+/, "");
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function resolvePreviewNodePaths(additionalNodePaths?: string[]) {
  const appRequire = Module.createRequire(
    path.join(process.cwd(), "package.json"),
  );
  const candidates = [
    path.join(process.cwd(), "node_modules"),
    path.dirname(appRequire.resolve("react/package.json")),
    ...(additionalNodePaths ?? []),
  ];

  return Array.from(new Set(candidates));
}
