import fs from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
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
    const entryContent = `import * as Mod from "./index";

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

export default Component;
export const __previewProps = PREVIEW_PROPS;
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
      plugins: [
        cssPlugin,
        figmaAssetPlugin,
        stubbedBareModulePlugin,
      ],
      external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime"],
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
    const appRequire = Module.createRequire(
      path.join(process.cwd(), "package.json"),
    );
    const runtime = loadHostReactRuntime(appRequire);
    const runtimeRequire = ((spec: string) => {
      if (
        isRuntimeModuleRequest(spec, [
          "react",
          "react/index.js",
          "react/index",
        ])
      ) {
        return runtime.React;
      }
      if (
        isRuntimeModuleRequest(spec, [
          "react/jsx-runtime",
          "react/jsx-runtime.js",
          "react/jsx-dev-runtime",
          "react/jsx-dev-runtime.js",
        ])
      ) {
        return runtime.jsxRuntime;
      }
      return appRequire(spec);
    }) as NodeJS.Require;
    runtimeRequire.resolve = appRequire.resolve.bind(appRequire);
    runtimeRequire.cache = appRequire.cache;
    runtimeRequire.extensions = appRequire.extensions;
    runtimeRequire.main = appRequire.main;
    const exportsObject: Record<string, unknown> = {};
    const moduleObject = {
      exports: exportsObject,
      filename: modulePath,
      id: modulePath,
      loaded: false,
      path: path.dirname(modulePath),
      paths: (Module as typeof Module & { _nodeModulePaths(from: string): string[] })
        ._nodeModulePaths(process.cwd()),
    };
    const wrapper = Module.wrap(source);
    const compiled = vm.runInThisContext(wrapper, { filename: modulePath }) as (
      exports: Record<string, unknown>,
      require: NodeJS.Require,
      module: typeof moduleObject,
      __filename: string,
      __dirname: string,
    ) => void;
    compiled.call(
      moduleObject.exports,
      moduleObject.exports,
      runtimeRequire,
      moduleObject,
      modulePath,
      path.dirname(modulePath),
    );
    const exported = moduleObject.exports as {
      default?: unknown;
      __previewProps?: unknown;
    };
    const Component = exported.default;
    if (!Component || typeof Component !== "function") {
      throw new Error("No suitable component export found from ./index for preview smoke test");
    }
    runtime.renderToString(
      runtime.React.createElement(
        Component as (props: unknown) => unknown,
        exported.__previewProps ?? {},
      ),
    );
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

function loadHostReactRuntime(appRequire: NodeJS.Require) {
  const React = appRequire("react") as {
    createElement: (type: unknown, props: unknown) => unknown;
    Fragment?: unknown;
  };
  const { renderToString } = appRequire("react-dom/server") as {
    renderToString: (node: unknown) => string;
  };
  const jsxRuntime = createJsxRuntimeShim(React);
  return { React, jsxRuntime, renderToString };
}

function isRuntimeModuleRequest(spec: string, candidates: string[]) {
  return candidates.some((candidate) => {
    return spec === candidate || spec.endsWith(`/${candidate}`);
  });
}

function createJsxRuntimeShim(React: {
  createElement: (type: unknown, props: unknown) => unknown;
  Fragment?: unknown;
}) {
  const makeElement = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
    const nextProps =
      key === undefined ? props : { ...(props ?? {}), key };
    return React.createElement(type, nextProps ?? {});
  };

  return {
    Fragment: React.Fragment ?? "fragment",
    jsx: makeElement,
    jsxs: makeElement,
    jsxDEV: makeElement,
  };
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
