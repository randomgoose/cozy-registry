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
import {
  getPrebundleDependencies,
  type DependencyDecision,
} from "@/lib/third-party-dependency-governance";
import {
  resolvePreviewDependencies,
  type PreviewDependencyResolutionDiagnostic,
} from "@/lib/preview-dependency-provider";

type SmokeTestCode = "PREVIEW_BUILD_FAILED" | "PREVIEW_RENDER_FAILED";
const SMOKE_EXECUTION_TIMEOUT_MS = 3000;

export type RegistryPreviewSmokeTestResult =
  | { ok: true; dependencyResolutionDiagnostics?: PreviewDependencyResolutionDiagnostic[] }
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
  dependencyDecisions?: DependencyDecision[];
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
    const resolvedPreviewDependencies = await resolvePreviewDependencies({
      decisions: params.dependencyDecisions ?? [],
    });
    const passThroughBareImports = await collectPassThroughBareImports(
      getPrebundleDependencies(params.dependencyDecisions ?? []),
      resolvedPreviewDependencies.nodePaths,
    );
    const unsupportedBareImports = findUnsupportedBareImports(importSpecifiers);
    if (unsupportedBareImports.length > 0) {
      return {
        ok: false,
        code: "PREVIEW_BUILD_FAILED",
        message:
          `Unsupported bare module imports in preview smoke test: ` +
          unsupportedBareImports.map((s) => `"${s}"`).join(", "),
      };
    }
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
  var keys = Object.keys(Mod || {}).filter(function (k) {
    return k !== "__esModule" && k !== "__previewProps";
  });
  var previewExportHint = PREVIEW_HINTS && PREVIEW_HINTS.previewExport ? PREVIEW_HINTS.previewExport : "";
  var help =
    "No suitable component export found from ./index for preview smoke test.\\n\\n" +
    "Detected exports: " + (keys.length ? keys.join(", ") : "(none)") + "\\n\\n" +
    "How to fix:\\n" +
    "- Add a default export (export default Component), or\\n" +
    "- Pass previewExport (e.g. previewExport: \\"MyComponent\\"), or\\n" +
    "- Export a PreviewComponent for composite/multi-part APIs.\\n\\n" +
    (previewExportHint ? ("Current previewExport hint: " + previewExportHint + "\\n") : "") +
    ("Name-based hints tried: PreviewComponent, " + PREVIEW_HINTS.pascal + ", " + PREVIEW_HINTS.camel);
  throw new Error(help);
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
    const stubbedBareModulePlugin = createBareModuleStubPlugin(
      importSpecifiers,
      passThroughBareImports,
    );
    const previewNodePaths = resolvePreviewNodePaths();

    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: ["node20"],
      jsx: "automatic",
      write: false,
      logLevel: "silent",
      nodePaths: Array.from(
        new Set([...previewNodePaths, ...resolvedPreviewDependencies.nodePaths]),
      ),
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
    const execution = await runNodeModule(
      smokeBundlePath,
      output,
      passThroughBareImports,
    );
    if (execution.ok) {
      return {
        ok: true,
        dependencyResolutionDiagnostics:
          resolvedPreviewDependencies.diagnostics,
      };
    }
    return {
      ok: false,
      code: "PREVIEW_RENDER_FAILED",
      message: withSmokeFailureHint(execution.message),
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
  allowedModuleImports: Set<string>,
): Promise<
  | { ok: true }
  | { ok: false; message: string; stack?: string }
> {
  const execute = async (): Promise<
    | { ok: true }
    | { ok: false; message: string; stack?: string }
  > => {
    const appRequire = Module.createRequire(
      path.join(process.cwd(), "package.json"),
    );
    const runtime = await loadHostReactRuntime(appRequire);
    const runtimeRequire = ((spec: string) => {
      if (isRuntimeReactRequest(spec)) {
        return runtime.ReactRequire;
      }
      if (isRuntimeJsxRequest(spec)) {
        return runtime.jsxRuntime;
      }
      if (allowedModuleImports.has(spec)) {
        return appRequire(spec);
      }
      throw new Error(
        `Preview smoke runtime blocked module import: "${spec}". Only React runtime modules and governance-approved preview dependencies are allowed.`,
      );
    }) as NodeJS.Require;
    runtimeRequire.resolve = ((spec: string) => {
      if (
        !isRuntimeReactRequest(spec) &&
        !isRuntimeJsxRequest(spec) &&
        !allowedModuleImports.has(spec)
      ) {
        throw new Error(
          `Preview smoke runtime blocked module resolution: "${spec}". Only React runtime modules and governance-approved preview dependencies are allowed.`,
        );
      }
      return appRequire.resolve(spec);
    }) as NodeJS.Require["resolve"];
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
    const context = createSmokeVmContext(modulePath);
    const compiled = vm.runInContext(wrapper, context, {
      filename: modulePath,
    }) as (
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
    if (!isRenderablePreviewExport(Component)) {
      throw new Error("No suitable component export found from ./index for preview smoke test");
    }
    await Promise.resolve(
      runtime.renderToString(
        runtime.React.createElement(
          Component as unknown,
          exported.__previewProps ?? {},
        ),
      ),
    );
    return { ok: true };
  };

  return withTimeout(execute(), SMOKE_EXECUTION_TIMEOUT_MS, () => {
    return {
      ok: false,
      message:
        `Preview smoke execution timed out after ${SMOKE_EXECUTION_TIMEOUT_MS}ms.` +
        ` This usually means the component entered a render loop or performs long-running synchronous work during render.`,
    };
  }).catch((error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      ok: false,
      message: err.message,
      stack: err.stack,
    };
  });
}

function createSmokeVmContext(modulePath: string) {
  const sandbox: Record<string, unknown> = {
    console,
  };
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  sandbox.self = sandbox;
  return vm.createContext(sandbox, {
    name: `cozy-preview-smoke:${path.basename(modulePath)}`,
  });
}

async function loadHostReactRuntime(appRequire: NodeJS.Require) {
  const ReactModule = await import("react");
  const React = pickReactObject(ReactModule) as {
    createElement: (type: unknown, props: unknown) => unknown;
    Fragment?: unknown;
  };
  const ReactRequire = toRequireCompatibleReact(ReactModule, React);
  const { renderToString } = await loadHostReactDomServer(appRequire);
  const jsxRuntime = createJsxRuntimeShim(React);
  return { React, ReactRequire, jsxRuntime, renderToString };
}

type SmokeRenderToString = (node: unknown) => string | Promise<string>;

function pickReactObject(mod: unknown) {
  if (mod && typeof mod === "object" && "createElement" in (mod as Record<string, unknown>)) {
    return mod;
  }
  const d = (mod as { default?: unknown } | null | undefined)?.default;
  if (d && typeof d === "object" && "createElement" in (d as Record<string, unknown>)) {
    return d;
  }
  throw new Error("Unable to load React runtime object for preview smoke test");
}

function toRequireCompatibleReact(mod: unknown, fallbackReact: unknown) {
  const m = mod as { default?: unknown } | null | undefined;
  const d = m?.default;
  const candidate =
    d && typeof d === "object" && "useState" in (d as Record<string, unknown>)
      ? (d as Record<string, unknown>)
      : mod && typeof mod === "object" && "useState" in (mod as Record<string, unknown>)
        ? (mod as Record<string, unknown>)
        : (fallbackReact as Record<string, unknown>);

  if (!("default" in candidate)) {
    Object.defineProperty(candidate, "default", {
      value: candidate,
      enumerable: false,
      configurable: true,
    });
  }
  return candidate;
}

async function loadHostReactDomServer(appRequire: NodeJS.Require) {
  const importCandidates = [
    "react-dom/server.node",
    "react-dom/server",
    "react-dom/server.edge",
    "react-dom/server.browser",
  ] as const;
  for (const spec of importCandidates) {
    try {
      const mod = (await import(spec)) as {
        renderToString?: (node: unknown) => string;
        renderToStaticMarkup?: (node: unknown) => string;
      };
      if (typeof mod.renderToString === "function") {
        return { renderToString: mod.renderToString as SmokeRenderToString };
      }
      if (typeof mod.renderToStaticMarkup === "function") {
        return { renderToString: mod.renderToStaticMarkup as SmokeRenderToString };
      }
    } catch {
      continue;
    }
  }

  const requireCandidates = [
    "react-dom/server.node",
    "react-dom/server",
    "react-dom/server.edge",
    "react-dom/server.browser",
  ] as const;
  for (const spec of requireCandidates) {
    try {
      const mod = appRequire(spec) as {
        renderToString?: (node: unknown) => string;
        renderToStaticMarkup?: (node: unknown) => string;
      };
      if (typeof mod.renderToString === "function") {
        return { renderToString: mod.renderToString as SmokeRenderToString };
      }
      if (typeof mod.renderToStaticMarkup === "function") {
        return { renderToString: mod.renderToStaticMarkup as SmokeRenderToString };
      }
    } catch {
      continue;
    }
  }

  // Last-chance fallback: load React DOM server files directly from react-dom package dir.
  try {
    const reactDomPkgJson = appRequire.resolve("react-dom/package.json");
    const reactDomRoot = path.dirname(reactDomPkgJson);
    const directCandidates = [
      "cjs/react-dom-server-legacy.node.production.js",
      "cjs/react-dom-server-legacy.node.development.js",
      "cjs/react-dom-server.node.production.js",
      "cjs/react-dom-server.node.development.js",
      "server.node.js",
      "server.js",
    ] as const;
    for (const rel of directCandidates) {
      try {
        const abs = path.join(reactDomRoot, rel);
        const mod = appRequire(abs) as {
          renderToString?: (node: unknown) => string;
          renderToStaticMarkup?: (node: unknown) => string;
        };
        if (typeof mod.renderToString === "function") {
          return { renderToString: mod.renderToString as SmokeRenderToString };
        }
        if (typeof mod.renderToStaticMarkup === "function") {
          return { renderToString: mod.renderToStaticMarkup as SmokeRenderToString };
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Fall through.
  }

  try {
    const mod = (await import("react-dom/server")) as {
      renderToReadableStream?: (node: unknown) => Promise<ReadableStream>;
    };
    if (typeof mod.renderToReadableStream === "function") {
      return {
        async renderToString(node: unknown): Promise<string> {
          const stream = await mod.renderToReadableStream?.(node);
          if (!stream) return "";
          if ("allReady" in stream && stream.allReady instanceof Promise) {
            await stream.allReady;
          }
          return "";
        },
      };
    }
  } catch {
    // Fall through.
  }

  throw new Error(
    `Unable to load a React DOM server renderer from: react-dom/server.node, react-dom/server, react-dom/server.edge, react-dom/server.browser`,
  );
}

function isRuntimeModuleRequest(spec: string, candidates: string[]) {
  return candidates.some((candidate) => {
    return spec === candidate || spec.endsWith(`/${candidate}`);
  });
}

function isRuntimeReactRequest(spec: string) {
  return isRuntimeModuleRequest(spec, [
    "react",
    "react/index.js",
    "react/index",
  ]);
}

function isRuntimeJsxRequest(spec: string) {
  return isRuntimeModuleRequest(spec, [
    "react/jsx-runtime",
    "react/jsx-runtime.js",
    "react/jsx-dev-runtime",
    "react/jsx-dev-runtime.js",
  ]);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(onTimeout());
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function withSmokeFailureHint(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("element type is invalid")) {
    return (
      `${message}\n\nHint: Check your default/named exports and ensure rendered components are defined (not undefined/null).`
    );
  }
  if (lower.includes("timed out")) {
    return (
      `${message}\n\nHint: Avoid long-running sync work in render; move heavy logic outside render or behind lazy boundaries.`
    );
  }
  if (lower.includes("process is not defined")) {
    return (
      `${message}\n\nHint: Preview smoke runs in a restricted sandbox; avoid accessing Node globals like process in component render code.`
    );
  }
  return message;
}

export const __previewSmokeInternals = {
  withTimeout,
  withSmokeFailureHint,
};

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

function isRenderablePreviewExport(value: unknown) {
  if (value == null) return false;
  if (typeof value === "function") return true;
  if (typeof value === "object" && "$$typeof" in value) return true;
  return false;
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
      const namespaceImportLocals = new Map<string, string>();
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
          } else if (importer.type === "ImportNamespaceSpecifier") {
            namespaceImportLocals.set(importer.local.name, spec);
          }
        }
        out.set(spec, entry);
      }

      // For namespace imports (import * as Foo from "pkg"), capture used members
      // (e.g. Foo.Root) so stub modules can expose corresponding named exports.
      if (namespaceImportLocals.size > 0) {
        walkAst(ast.program, (node) => {
          if (node.type === "MemberExpression") {
            const object = node.object as { type?: string; name?: string };
            const property = node.property as { type?: string; name?: string };
            if (node.computed) return;
            if (object.type !== "Identifier" || !object.name) return;
            if (property.type !== "Identifier" || !property.name) return;
            const spec = namespaceImportLocals.get(object.name);
            if (!spec) return;
            const entry =
              out.get(spec) ??
              { defaultImport: false, namedImports: new Set<string>() };
            entry.namedImports.add(property.name);
            out.set(spec, entry);
            return;
          }
          if (node.type === "JSXMemberExpression") {
            const object = node.object as { type?: string; name?: string };
            const property = node.property as { type?: string; name?: string };
            if (object.type !== "JSXIdentifier" || !object.name) return;
            if (property.type !== "JSXIdentifier" || !property.name) return;
            const spec = namespaceImportLocals.get(object.name);
            if (!spec) return;
            const entry =
              out.get(spec) ??
              { defaultImport: false, namedImports: new Set<string>() };
            entry.namedImports.add(property.name);
            out.set(spec, entry);
          }
        });
      }
    } catch {
      continue;
    }
  }

  return out;
}

function walkAst(
  node: unknown,
  visit: (node: { type?: string; [k: string]: unknown }) => void,
) {
  if (!node || typeof node !== "object") return;
  const current = node as { type?: string; [k: string]: unknown };
  if (typeof current.type === "string") {
    visit(current);
  }
  for (const value of Object.values(current)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walkAst(item, visit);
      }
    } else if (value && typeof value === "object") {
      walkAst(value, visit);
    }
  }
}

function createBareModuleStubPlugin(
  specifiers: Map<string, BareImportSpecifiers>,
  passThroughBareImports: Set<string>,
): import("esbuild").Plugin {
  return {
    name: "smoke-bare-module-stub",
    setup(build: import("esbuild").PluginBuild) {
      build.onResolve({ filter: /^[^./].*/ }, (args) => {
        if (args.path === "react" || args.path === "react-dom/server" || args.path === "react/jsx-runtime") {
          return null;
        }
        if (passThroughBareImports.has(args.path)) {
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

function findUnsupportedBareImports(specifiers: Map<string, BareImportSpecifiers>) {
  const builtinModules = getBuiltinModuleNames();
  const unsupported: string[] = [];
  for (const spec of specifiers.keys()) {
    if (spec.startsWith("figma:asset/")) continue;
    if (isNodeBuiltinImport(spec, builtinModules)) {
      unsupported.push(spec);
    }
  }
  return unsupported.sort();
}

function getBuiltinModuleNames() {
  const out = new Set<string>();
  for (const mod of Module.builtinModules) {
    out.add(mod);
    if (!mod.startsWith("node:")) out.add(`node:${mod}`);
  }
  return out;
}

function isNodeBuiltinImport(spec: string, builtinModules: Set<string>) {
  if (!spec || spec.startsWith(".") || spec.startsWith("/")) return false;
  if (builtinModules.has(spec)) return true;
  if (spec.startsWith("node:")) return true;
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    if (parts.length < 2) return false;
    return builtinModules.has(`${parts[0]}/${parts[1]}`);
  }
  const idx = spec.indexOf("/");
  const root = idx === -1 ? spec : spec.slice(0, idx);
  return builtinModules.has(root);
}

function resolvePreviewNodePaths() {
  const appRequire = Module.createRequire(
    path.join(process.cwd(), "package.json"),
  );
  const candidates = [
    path.join(process.cwd(), "node_modules"),
    path.dirname(appRequire.resolve("react/package.json")),
  ];

  return Array.from(new Set(candidates));
}

async function collectPassThroughBareImports(
  roots: string[],
  nodePaths: string[],
): Promise<Set<string>> {
  const appRequire = Module.createRequire(
    path.join(process.cwd(), "package.json"),
  );
  const out = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const spec = queue.shift();
    if (!spec || out.has(spec)) continue;
    out.add(spec);

    try {
      const packageEntryPath = appRequire.resolve(spec, { paths: nodePaths });
      const packageJsonPath = await findNearestPackageJson(packageEntryPath);
      if (!packageJsonPath) continue;
      const raw = await fs.readFile(packageJsonPath, "utf8");
      const parsed = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      for (const dep of Object.keys(parsed.dependencies ?? {})) {
        if (!out.has(dep)) queue.push(dep);
      }
      for (const dep of Object.keys(parsed.peerDependencies ?? {})) {
        if (!out.has(dep)) queue.push(dep);
      }
    } catch {
      continue;
    }
  }

  return out;
}

async function findNearestPackageJson(fromPath: string): Promise<string | null> {
  let current = path.dirname(fromPath);

  while (true) {
    const candidate = path.join(current, "package.json");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }
}
