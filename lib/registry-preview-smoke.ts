import fs from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import * as parser from "@babel/parser";
import {
  resolveRegistryDependencies,
} from "@/lib/registry-resolver";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import { materializeInstalledRegistryFilesFromResolvedGraph } from "@/lib/registry-install-layout";

type SmokeTestCode = "PREVIEW_BUILD_FAILED" | "PREVIEW_RENDER_FAILED";

export type RegistryPreviewSmokeTestResult =
  | { ok: true }
  | {
      ok: false;
      code: SmokeTestCode;
      message: string;
      stack?: string;
    };

type BareImportSpecifiers = {
  defaultImport: boolean;
  namedImports: Set<string>;
};

type SmokeResolvedNode = {
  ref: {
    owner: string;
    name: string;
    version: string | null;
    ref: string;
  };
  item: {
    type: string;
    files?: Array<{
      id: string;
      itemId: string;
      path: string;
      content: string;
      type: string;
    }>;
    registryDependencies?: string[] | null;
  };
};

const PARSE_OPTIONS: parser.ParserOptions = {
  sourceType: "module",
  plugins: ["typescript", "jsx"],
};

export async function runRegistryPreviewSmokeTest(params: {
  name: string;
  files?: Record<string, string>;
  content?: string | null;
  previewProps?: unknown;
  previewExport?: string;
  registryDependencies?: string[];
  requestUserId?: string | null;
}): Promise<RegistryPreviewSmokeTestResult> {
  const rootFiles =
    params.files && Object.keys(params.files).length > 0
      ? params.files
      : params.content
        ? { "index.tsx": params.content }
        : null;

  if (!rootFiles) {
    return {
      ok: false,
      code: "PREVIEW_BUILD_FAILED",
      message: "No source files available for preview smoke test",
    };
  }

  const directDeps = (params.registryDependencies ?? [])
    .map((raw) => parseRegistryDependencyRef(raw))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const merged = new Map<string, SmokeResolvedNode>();

  for (const dep of directDeps) {
    const resolved = await resolveRegistryDependencies({
      owner: dep.owner,
      name: dep.name,
      version: dep.version,
      requestUserId: params.requestUserId,
    });
    for (const node of resolved.ordered) {
      merged.set(node.ref.ref, {
        ref: node.ref,
        item: {
          type: node.item.type,
          files: node.item.files,
          registryDependencies: node.item.registryDependencies,
        },
      });
    }
  }

  const rootRef = `@__local__/${params.name}`;
  merged.set(rootRef, {
    ref: {
      owner: "__local__",
      name: params.name,
      version: null,
      ref: rootRef,
    },
    item: {
      type: "registry:ui",
      files: Object.entries(rootFiles).map(([filePath, content]) => ({
        id: `${rootRef}:${filePath}`,
        itemId: rootRef,
        path: filePath,
        content,
        type: "registry:file",
      })),
      registryDependencies: params.registryDependencies ?? [],
    },
  });

  const installedLayout = materializeInstalledRegistryFilesFromResolvedGraph(
    Array.from(merged.values()),
  );
  const rootEntry = installedLayout.rootEntries[rootRef];
  const files = { ...installedLayout.files };
  if (rootEntry) {
    files["index.tsx"] =
      `export { default } from "./${rootEntry}";\nexport * from "./${rootEntry}";\n`;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cozy-preview-smoke-"));
  try {
    for (const [relPath, content] of Object.entries(files)) {
      const abs = path.join(tmpDir, relPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf8");
    }

    const previewPropsJson = safeSerialize(params.previewProps ?? {});
    const previewHints = JSON.stringify({
      previewExport:
        typeof params.previewExport === "string" && params.previewExport.trim().length > 0
          ? params.previewExport.trim()
          : null,
      pascal: slugToPascalExportName(params.name),
      camel: slugToCamelExportName(params.name),
    });
    const importSpecifiers = collectBareImportSpecifiers(files);
    const entryPath = path.join(tmpDir, "smoke-entry.tsx");
    const entryContent = `import React from "react";
import { renderToString } from "react-dom/server";
import * as Mod from "./index";

const PREVIEW_HINTS = ${previewHints};
const PREVIEW_PROPS = ${previewPropsJson};

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

  return (
    tryKey(hints.previewExport) ||
    (cozyIsRenderableExport(Mod.default) ? Mod.default : null) ||
    tryKey("PreviewComponent") ||
    tryKey(hints.pascal) ||
    tryKey(hints.camel)
  );
}

const Component = cozyResolvePreviewComponent(Mod, PREVIEW_HINTS);
if (!cozyIsRenderableExport(Component)) {
  throw new Error("No suitable component export found from ./index for preview smoke test");
}

renderToString(React.createElement(Component, PREVIEW_PROPS));
export const __smoke = true;
`;
    await fs.writeFile(entryPath, entryContent, "utf8");

    const esbuild = await import("esbuild");
    const cssPlugin: import("esbuild").Plugin = {
      name: "smoke-css",
      setup(build: import("esbuild").PluginBuild) {
        build.onLoad({ filter: /\.css$/ }, () => ({
          contents: "export default undefined;",
          loader: "js",
        }));
      },
    };
    const figmaAssetPlugin: import("esbuild").Plugin = {
      name: "smoke-figma-asset-stub",
      setup(build: import("esbuild").PluginBuild) {
        build.onResolve({ filter: /^figma:asset\// }, (args) => ({
          path: args.path,
          namespace: "figma-asset",
        }));
        build.onLoad({ filter: /.*/, namespace: "figma-asset" }, () => ({
          contents: `export default "";`,
          loader: "js",
        }));
      },
    };
    const stubbedBareModulePlugin = createBareModuleStubPlugin(importSpecifiers);

    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: ["node20"],
      jsx: "automatic",
      write: false,
      logLevel: "silent",
      plugins: [cssPlugin, figmaAssetPlugin, stubbedBareModulePlugin],
      external: ["react", "react-dom/server", "react/jsx-runtime"],
    });

    const output = result.outputFiles?.[0]?.text;
    if (!output) {
      return {
        ok: false,
        code: "PREVIEW_BUILD_FAILED",
        message: "Failed to generate preview smoke bundle",
      };
    }

    const smokeBundlePath = path.join(tmpDir, "smoke-bundle.cjs");
    await fs.writeFile(smokeBundlePath, output, "utf8");
    const execution = await runNodeModule(smokeBundlePath, output);
    if (execution.ok) {
      return { ok: true };
    }
    return {
      ok: false,
      code: "PREVIEW_RENDER_FAILED",
      message: execution.message,
      stack: execution.stack,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ok: false,
      code: "PREVIEW_BUILD_FAILED",
      message: err.message,
      stack: err.stack,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runNodeModule(
  modulePath: string,
  source: string,
): Promise<
  | { ok: true }
  | { ok: false; message: string; stack?: string }
> {
  try {
    const moduleApi = Module as typeof Module & {
      _nodeModulePaths(from: string): string[];
    };
    const smokeModule = new Module.Module(modulePath) as Module & {
      _compile(code: string, filename: string): void;
    };
    smokeModule.filename = modulePath;
    smokeModule.paths = moduleApi._nodeModulePaths(process.cwd());
    smokeModule._compile(source, modulePath);
    return { ok: true };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ok: false,
      message: err.message,
      stack: err.stack,
    };
  }
}

function safeSerialize(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function isBareModuleSpecifier(spec: string) {
  return !spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("/");
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
  const tail = rest
    .map((p) => (p[0] ? p[0].toUpperCase() + p.slice(1) : ""))
    .join("");
  return head + tail;
}

function collectBareImportSpecifiers(
  files: Record<string, string>,
): Map<string, BareImportSpecifiers> {
  const out = new Map<string, BareImportSpecifiers>();

  for (const [filePath, source] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?)$/i.test(filePath)) continue;
    try {
      const ast = parser.parse(source, PARSE_OPTIONS);
      for (const node of ast.program.body) {
        if (node.type !== "ImportDeclaration") continue;
        const spec = node.source.value;
        if (typeof spec !== "string" || !isBareModuleSpecifier(spec)) continue;
        const entry =
          out.get(spec) ??
          { defaultImport: false, namedImports: new Set<string>() };
        for (const importer of node.specifiers) {
          if (importer.type === "ImportDefaultSpecifier") {
            entry.defaultImport = true;
          } else if (importer.type === "ImportSpecifier") {
            const imported = importer.imported;
            if (imported.type === "Identifier") {
              entry.namedImports.add(imported.name);
            }
          }
        }
        out.set(spec, entry);
      }
    } catch {
      continue;
    }
  }

  return out;
}

function createBareModuleStubPlugin(
  specifiers: Map<string, BareImportSpecifiers>,
): import("esbuild").Plugin {
  return {
    name: "smoke-bare-module-stub",
    setup(build: import("esbuild").PluginBuild) {
      build.onResolve({ filter: /^[^./].*/ }, (args) => {
        if (args.path === "react" || args.path === "react-dom/server" || args.path === "react/jsx-runtime") {
          return null;
        }
        return {
          path: args.path,
          namespace: "cozy-bare-module-stub",
        };
      });

      build.onLoad({ filter: /.*/, namespace: "cozy-bare-module-stub" }, (args) => {
        const spec = specifiers.get(args.path) ?? {
          defaultImport: true,
          namedImports: new Set<string>(),
        };
        const namedExports = Array.from(spec.namedImports)
          .map((name) => `export const ${name} = __cozyStub;`)
          .join("\n");
        return {
          contents: `
const __cozyStub = new Proxy(function CozyStub() { return null; }, {
  get() { return __cozyStub; },
  apply() { return null; }
});
${spec.defaultImport ? "export default __cozyStub;" : ""}
${namedExports}
export const __esModule = true;
`,
          loader: "js",
        };
      });
    },
  };
}
