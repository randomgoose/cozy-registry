import path from "node:path";
import {
  isCodeFile,
  isRelativeImport,
  resolveRelativeImport,
} from "@/lib/validate-tsx";

/** Cozy default install root: `{REGISTRY_INSTALL_ROOT}/{owner}/{name}/`. */
export const REGISTRY_INSTALL_ROOT = "src/components/registry";

export type InstallDependencyTarget = {
  owner: string;
  name: string;
  projectSlug?: string | null;
  version: string;
  entryPath: string;
};

export function getDefaultInstallDir(params: {
  owner: string;
  name: string;
  projectSlug?: string | null;
}): string {
  return normalizePosix(
    path.posix.join(
      REGISTRY_INSTALL_ROOT,
      params.owner,
      params.projectSlug ? params.projectSlug : "",
      params.name,
    ),
  );
}

export function pickInstallEntryPath(
  files: Array<{ path: string }>,
): string {
  const paths = files.map((file) =>
    normalizeInstallFilePath(file.path),
  );
  if (paths.includes("index.tsx")) return "index.tsx";
  if (paths.includes("index.ts")) return "index.ts";
  if (paths.includes("index.jsx")) return "index.jsx";
  if (paths.includes("index.js")) return "index.js";
  if (paths.includes("theme.css")) return "theme.css";
  return paths[0] ?? "index.tsx";
}

export function rewriteInstalledRegistryImports<T extends { path: string; content: string }>(
  params: {
    files: T[];
    rootOwner: string;
    rootName: string;
    rootProjectSlug?: string | null;
    dependencyTargets: Map<string, InstallDependencyTarget>;
  },
): T[] {
  const localFilePaths = new Set(
    params.files.map((file) => normalizeInstallFilePath(file.path)),
  );
  const installBaseDir = getDefaultInstallDir({
    owner: params.rootOwner,
    name: params.rootName,
    projectSlug: params.rootProjectSlug ?? null,
  });

  return params.files.map((file) => {
    const normalizedPath = normalizeInstallFilePath(file.path);
    if (!isCodeFile(normalizedPath)) return file;

    const rewritten = rewriteSourceImports(file.content, (specifier) => {
      const directTarget = params.dependencyTargets.get(specifier.trim());
      if (directTarget) {
        return buildRelativeImportToDependency({
          importerProjectFile: path.posix.join(installBaseDir, normalizedPath),
          target: directTarget,
        });
      }

      if (!isRelativeImport(specifier)) return null;
      const resolvedLocal = resolveRelativeImport(normalizedPath, specifier);
      if (resolvedLocal.some((candidate) => localFilePaths.has(normalizePosix(candidate)))) {
        return null;
      }

      const stem = fileStemToRegistryName(specifier);
      const inferredTarget = params.dependencyTargets.get(stem);
      if (!inferredTarget) return null;

      return buildRelativeImportToDependency({
        importerProjectFile: path.posix.join(installBaseDir, normalizedPath),
        target: inferredTarget,
      });
    });

    return rewritten === file.content ? file : { ...file, content: rewritten };
  });
}

export function buildDependencyTargetIndex(
  ordered: Array<{
    ref: {
      owner: string;
      projectKey: string | null;
      name: string;
      version: string | null;
      ref: string;
    };
    item: { type: string; files?: Array<{ path: string }>; registryDependencies?: string[] | null };
  }>,
): Map<string, InstallDependencyTarget> {
  const out = new Map<string, InstallDependencyTarget>();
  const byName = new Map<string, InstallDependencyTarget[]>();

  for (const { ref, item } of ordered) {
    if (item.type === "registry:theme") continue;
    const target: InstallDependencyTarget = {
      owner: ref.owner,
      name: ref.name,
      projectSlug: ref.projectKey ?? null,
      version: ref.version ?? "0.0.0",
      entryPath: pickInstallEntryPath(item.files ?? []),
    };
    out.set(ref.ref, target);
    out.set(`@${ref.owner}/${ref.name}`, target);
    if (ref.version) out.set(`@${ref.owner}/${ref.name}@${ref.version}`, target);
    if (ref.projectKey) {
      out.set(`@${ref.owner}/${ref.projectKey}/${ref.name}`, target);
      if (ref.version) {
        out.set(`@${ref.owner}/${ref.projectKey}/${ref.name}@${ref.version}`, target);
      }
    }
    const list = byName.get(ref.name) ?? [];
    list.push(target);
    byName.set(ref.name, list);
  }

  for (const [name, matches] of byName) {
    if (matches.length === 1) out.set(name, matches[0]);
  }

  return out;
}

export function materializeInstalledRegistryFilesFromResolvedGraph(
  ordered: Array<{
    ref: {
      owner: string;
      projectKey: string | null;
      name: string;
      version: string | null;
      ref: string;
    };
    item: {
      type: string;
      files?: Array<{ path: string; content: string }>;
      registryDependencies?: string[] | null;
    };
  }>,
): {
  files: Record<string, string>;
  sources: string[];
  rootEntries: Record<string, string>;
} {
  const out: Record<string, string> = {};
  const sources: string[] = [];
  const rootEntries: Record<string, string> = {};
  const targetIndex = buildDependencyTargetIndex(ordered);

  for (const { ref, item } of ordered) {
    if (item.type === "registry:theme") continue;
    const directTargets = new Map<string, InstallDependencyTarget>();
    for (const raw of item.registryDependencies ?? []) {
      const trimmed = raw.trim();
      const target = targetIndex.get(trimmed);
      if (!target) continue;
      directTargets.set(trimmed, target);
      directTargets.set(`@${target.owner}/${target.name}`, target);
      if (target.version) {
        directTargets.set(`@${target.owner}/${target.name}@${target.version}`, target);
      }
      const byName = targetIndex.get(target.name);
      if (byName) directTargets.set(target.name, byName);
    }

    const rewrittenFiles = rewriteInstalledRegistryImports({
      files: (item.files ?? []).map((file) => ({
        path: file.path,
        content: file.content,
      })),
      rootOwner: ref.owner,
      rootName: ref.name,
      rootProjectSlug: ref.projectKey ?? null,
      dependencyTargets: directTargets,
    });

    for (const file of rewrittenFiles) {
      const projectRelative = normalizePosix(
        path.posix.join(
          getDefaultInstallDir({
            owner: ref.owner,
            name: ref.name,
            projectSlug: ref.projectKey ?? null,
          }),
          normalizeInstallFilePath(file.path),
        ),
      );
      out[projectRelative] = file.content;
    }

    rootEntries[ref.ref] = normalizePosix(
      path.posix.join(
        getDefaultInstallDir({
          owner: ref.owner,
          name: ref.name,
          projectSlug: ref.projectKey ?? null,
        }),
        pickInstallEntryPath(item.files ?? []).replace(/\.(tsx?|jsx?|css)$/i, ""),
      ),
    );
    sources.push(ref.ref);
  }

  return { files: out, sources, rootEntries };
}

function rewriteSourceImports(
  source: string,
  resolveSpecifier: (specifier: string) => string | null,
): string {
  const patterns = [
    /(from\s*["'])([^"']+)(["'])/g,
    /(import\s*\(\s*["'])([^"']+)(["']\s*\))/g,
  ];

  let next = source;
  for (const pattern of patterns) {
    next = next.replace(pattern, (match, prefix, specifier, suffix) => {
      const replacement = resolveSpecifier(specifier);
      if (!replacement || replacement === specifier) return match;
      return `${prefix}${replacement}${suffix}`;
    });
  }
  return next;
}

function buildRelativeImportToDependency(params: {
  importerProjectFile: string;
  target: InstallDependencyTarget;
}): string {
  const targetBase = getDefaultInstallDir({
    owner: params.target.owner,
    name: params.target.name,
    projectSlug: params.target.projectSlug ?? null,
  });
  const entryWithoutExt = params.target.entryPath.replace(/\.(tsx?|jsx?|css)$/i, "");
  const targetModulePath = path.posix.join(targetBase, entryWithoutExt);
  const relative = normalizePosix(
    path.posix.relative(path.posix.dirname(params.importerProjectFile), targetModulePath),
  );
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function fileStemToRegistryName(specifier: string): string {
  const cleaned = specifier
    .replace(/^\.\/+/, "")
    .replace(/^(\.\.\/)+/, "")
    .split("/")
    .pop() ?? specifier;
  const stem = cleaned.replace(/\.(tsx?|jsx?|css)$/i, "");
  if (stem.includes("-")) return stem.toLowerCase();
  if (/^[A-Z]/.test(stem)) {
    return stem
      .replace(/^[A-Z]/, (c) => c.toLowerCase())
      .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  }
  return stem.toLowerCase();
}

function normalizePosix(p: string): string {
  return p.replaceAll("\\", "/");
}

export function normalizeInstallFilePath(filePath: string): string {
  let normalized = normalizePosix(filePath).replace(/^\.?\//, "").replace(/^\/+/, "");
  const knownPrefixes = [
    "src/components/registry/modules/",
    "src/registry/modules/",
    "registry/modules/",
  ];
  for (const prefix of knownPrefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  return normalized || "index.tsx";
}
