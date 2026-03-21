import fs from "fs/promises";
import os from "os";
import path from "path";

type EsbuildModule = typeof import("esbuild");

type ComponentBundle = {
  name: string;
  version: string;
  files: Record<string, string>;
  dependencies?: string[];
};

export type PreviewBuildResult =
  | { ok: true; code: string; css?: string }
  | {
      ok: false;
      error: {
        message: string;
        file?: string;
        line?: number;
        column?: number;
      };
    };

/**
 * Build a browser-ready ESM preview bundle from a ComponentBundle.
 * Uses a temporary on-disk project and esbuild, following the
 * high-level flow from docs/COMPONENT_PREVIEW_RUNTIME.md.
 */
export async function buildPreviewBundle(
  bundle: ComponentBundle,
  previewProps: unknown,
  options?: { mode?: "default" | "thumbnail" },
): Promise<PreviewBuildResult> {
  // 注意：为了避免 Next.js 在服务器 bundle 时把 esbuild 的可执行文件等一起打包，
  // 我们只在运行时动态引入它，而不是作为顶层静态依赖。
  // 这有助于绕过 Turbopack 对 README / bin 等非 JS 资源的解析问题。
  const esbuild: EsbuildModule = await import("esbuild");

  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "cozy-registry-preview-"),
  );

  try {
    // Write all source files to the temp directory, preserving relative paths.
    for (const [relPath, content] of Object.entries(bundle.files)) {
      const filePath = path.join(tmpDir, relPath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
    }

    // Ensure an index.tsx entry file exists. If not, create a shallow wrapper
    // that re-exports a sensible default from the first TSX file:
    // - 优先使用已有的 export default
    // - 其次使用约定的 PreviewComponent
    // - 否则使用首个导出的组件名（大写开头）
    if (!("index.tsx" in bundle.files)) {
      const entrySourcePath =
        Object.keys(bundle.files).find((p) => p.endsWith(".tsx")) ??
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
        const namedMatch = source.match(
          /export\s+(?:const|function|class)\s+([A-Z][A-Za-z0-9_]*)\b/,
        );
        const pickedName = namedMatch?.[1] ?? "Component";
        indexContent = `export { ${pickedName} as default } from "${importPath}";\n`;
      }

      const indexPath = path.join(tmpDir, "index.tsx");
      await fs.writeFile(indexPath, indexContent, "utf8");
    }

    // Generate preview-entry.tsx that renders the default export with props.
    const previewEntryPath = path.join(tmpDir, "preview-entry.tsx");
    let serializedProps = "{}";
    try {
      serializedProps = JSON.stringify(previewProps ?? {});
    } catch {
      serializedProps = "{}";
    }

    const mode = options?.mode === "thumbnail" ? "thumbnail" : "default";
    const previewEntryContent = `import React from "react";
import { createRoot } from "react-dom/client";
import * as Mod from "./index";

const Component =
  // 优先使用默认导出
  (Mod as any).default ??
  // 其次使用与组件名匹配的导出（如 name: "button-group" → ButtonGroup）
  (Mod as any)["${bundle.name
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join("")}"] ??
  // 其次使用约定的 PreviewComponent
  (Mod as any).PreviewComponent ??
  // 否则挑选首个大写开头的命名导出
  (() => {
    const keys = Object.keys(Mod);
    const found = keys.find((k) => /^[A-Z]/.test(k));
    return found ? (Mod as any)[found] : null;
  })();

if (!Component) {
  throw new Error("No suitable component export found from ./index for preview");
}

function App() {
  const props = ${serializedProps};
  const mode = ${JSON.stringify(mode)};
  const isThumbnail = mode === "thumbnail";
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
      }}
    >
      <div
        data-cozy-preview-content
        style={{
          width: isThumbnail ? "min(100%, 1280px)" : "fit-content",
          maxWidth: "100%",
          margin: "0 auto",
          transform: isThumbnail ? "scale(1.18)" : "none",
          transformOrigin: "top center",
        }}
      >
        <Component {...props} />
      </div>
    </div>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element for preview runtime");
}

const root = createRoot(container);
root.render(<App />);
`;

    await fs.writeFile(previewEntryPath, previewEntryContent, "utf8");

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

    // Run esbuild to bundle the preview entry into a single ESM file.
    const result = await esbuild.build({
      entryPoints: [previewEntryPath],
      bundle: true,
      format: "esm",
      platform: "browser",
      jsx: "automatic",
      outfile: "preview.js",
      target: ["es2018"],
      sourcemap: false,
      plugins: [cssPlugin, figmaAssetPlugin],
      // React 相关始终由 runtime import map 提供
      external: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        // 其余依赖全部 external，交给浏览器 import map + CDN 解决
        ...(bundle.dependencies ?? []),
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
    return { ok: true, code: output, css };
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
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
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
