import {
  getRegistryDependencyAccessForRef,
  getRegistryItemByOwnerNameAndVersion,
  getThemeEntryCss,
} from "@/lib/registry";
import {
  RegistryDependencyCycleError,
  RegistryDependencyNotFoundError,
  RegistryDependencyPermissionDeniedError,
} from "@/lib/registry-dependency-errors";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import path from "path";

export type ResolvedRegistryRef = {
  owner: string;
  name: string;
  version: string | null;
  ref: string; // "@owner/name" or "@owner/name@x.y.z"
};

export type ResolvedRegistryItem = Awaited<
  ReturnType<typeof getRegistryItemByOwnerNameAndVersion>
>;

export type ResolvedRegistryDependencyNode = {
  ref: ResolvedRegistryRef;
  item: NonNullable<ResolvedRegistryItem>;
};

export {
  RegistryDependencyCycleError,
  RegistryDependencyNotFoundError,
  RegistryDependencyPermissionDeniedError,
};

function toRef(owner: string, name: string, version: string | null): string {
  return version ? `@${owner}/${name}@${version}` : `@${owner}/${name}`;
}

/**
 * Resolve an item's transitive registryDependencies (deps-first order).
 * - Distinguishes version-pinned dependencies (same owner/name but different version are different nodes).
 * - Detects cycles and throws RegistryDependencyCycleError.
 */
export async function resolveRegistryDependencies(params: {
  owner: string;
  name: string;
  version: string | null;
  requestUserId?: string | null;
}): Promise<{
  /** Includes the root item as the last element. */
  ordered: ResolvedRegistryDependencyNode[];
}> {
  const ordered: ResolvedRegistryDependencyNode[] = [];
  const visited = new Set<string>();
  const stack: string[] = [];

  async function dfs(owner: string, name: string, version: string | null) {
    const ref = toRef(owner, name, version);
    if (visited.has(ref)) return;
    const stackIdx = stack.indexOf(ref);
    if (stackIdx >= 0) {
      throw new RegistryDependencyCycleError([...stack.slice(stackIdx), ref]);
    }

    stack.push(ref);

    const access = await getRegistryDependencyAccessForRef(
      owner,
      name,
      params.requestUserId,
    );
    if (access === "not_found") {
      stack.pop();
      throw new RegistryDependencyNotFoundError(ref);
    }
    if (access === "denied") {
      stack.pop();
      throw new RegistryDependencyPermissionDeniedError(ref);
    }

    const item = await getRegistryItemByOwnerNameAndVersion(
      owner,
      name,
      version,
      params.requestUserId,
    );
    if (!item) {
      stack.pop();
      throw new RegistryDependencyNotFoundError(ref);
    }

    const deps = (item.registryDependencies ?? []) as string[];
    for (const raw of deps) {
      const parsed = parseRegistryDependencyRef(raw);
      if (!parsed) continue;
      await dfs(parsed.owner, parsed.name, parsed.version);
    }

    stack.pop();
    visited.add(ref);
    ordered.push({
      ref: { owner, name, version, ref },
      item,
    });
  }

  await dfs(params.owner, params.name, params.version);
  return { ordered };
}

/**
 * Collect theme CSS from transitive registryDependencies (deps-first), de-duped by owner/name.
 */
export async function resolveTransitiveThemeCss(params: {
  owner: string;
  name: string;
  version: string | null;
  requestUserId?: string | null;
}): Promise<{ css: string; sources: string[] }> {
  const { ordered } = await resolveRegistryDependencies(params);
  return collectThemeCssFromResolvedGraph(ordered);
}

function pickDependencyEntryPath(files: { path: string; content: string }[]): string | null {
  const paths = files.map((f) => f.path);
  if (paths.includes("index.tsx")) return "index.tsx";
  const firstTsx = paths.find((p) => p.toLowerCase().endsWith(".tsx"));
  if (firstTsx) return firstTsx;
  const first = paths[0];
  return first ?? null;
}

/**
 * Materialize transitive non-theme registryDependencies into a file map under `_deps/<owner>/<name>/...`.
 * Intended for preview/build environments so that stub files can re-export from dependencies.
 */
export async function resolveTransitiveComponentSourceFiles(params: {
  owner: string;
  name: string;
  version: string | null;
  requestUserId?: string | null;
}): Promise<{ files: Record<string, string>; sources: string[] }> {
  const { ordered } = await resolveRegistryDependencies(params);
  return materializeComponentSourceFilesFromResolvedGraph(ordered, {
    owner: params.owner,
    name: params.name,
    version: params.version,
  });
}

export function collectThemeCssFromResolvedGraph(
  ordered: ResolvedRegistryDependencyNode[],
): { css: string; sources: string[] } {
  const seen = new Set<string>();
  const chunks: string[] = [];
  const sources: string[] = [];

  for (const { ref, item } of ordered) {
    if (item.type !== "registry:theme") continue;
    const key = `${ref.owner}/${ref.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const css = getThemeEntryCss(item);
    if (css && css.trim().length > 0) {
      chunks.push(css);
      sources.push(ref.ref);
    }
  }

  return { css: chunks.join("\n\n"), sources };
}

export function materializeComponentSourceFilesFromResolvedGraph(
  ordered: ResolvedRegistryDependencyNode[],
  root: { owner: string; name: string; version: string | null },
): { files: Record<string, string>; sources: string[] } {
  const out: Record<string, string> = {};
  const sources: string[] = [];
  const seen = new Set<string>();

  for (const { ref, item } of ordered) {
    if (item.type === "registry:theme") continue;
    // Skip root (we only want dependencies)
    if (
      ref.owner === root.owner &&
      ref.name === root.name &&
      ref.version === root.version
    ) {
      continue;
    }
    const key = `${ref.owner}/${ref.name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const depDir = path.posix.join("_deps", ref.owner, ref.name);
    const fileVersions = (item.files ?? []) as Array<{ path: string; content: string }>;
    const entry = pickDependencyEntryPath(fileVersions);
    if (!entry) continue;

    // Write all dependency files under depDir
    for (const f of fileVersions) {
      const rel = f.path.replace(/^\/+/, "");
      const p = path.posix.join(depDir, rel);
      out[p] = f.content;
    }

    // Synthetic index.tsx that re-exports from chosen entry (relative within depDir)
    const entryNoExt = entry.replace(/\.(tsx?|jsx?)$/i, "");
    out[path.posix.join(depDir, "index.tsx")] =
      `// auto-generated by cozy registry. do not edit.\nexport * from "./${entryNoExt}";\n`;

    sources.push(ref.ref);
  }

  return { files: out, sources };
}
