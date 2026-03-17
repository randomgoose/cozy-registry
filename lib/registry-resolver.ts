import { getRegistryItemByOwnerNameAndVersion, getThemeEntryCss } from "@/lib/registry";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";

export type ResolvedRegistryRef = {
  owner: string;
  name: string;
  version: string | null;
  ref: string; // "@owner/name" or "@owner/name@x.y.z"
};

export type ResolvedRegistryItem = Awaited<
  ReturnType<typeof getRegistryItemByOwnerNameAndVersion>
>;

export class RegistryDependencyCycleError extends Error {
  path: string[];
  constructor(path: string[]) {
    super(`Registry dependency cycle detected: ${path.join(" -> ")}`);
    this.name = "RegistryDependencyCycleError";
    this.path = path;
  }
}

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
  ordered: Array<{ ref: ResolvedRegistryRef; item: NonNullable<ResolvedRegistryItem> }>;
}> {
  const ordered: Array<{ ref: ResolvedRegistryRef; item: NonNullable<ResolvedRegistryItem> }> =
    [];
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

    const item = await getRegistryItemByOwnerNameAndVersion(
      owner,
      name,
      version,
      params.requestUserId,
    );
    if (!item) {
      stack.pop();
      // Missing dependency is treated as an error for resolver consumers.
      throw new Error(`Registry dependency not found: ${ref}`);
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

