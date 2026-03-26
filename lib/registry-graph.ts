export type RegistryType =
  | "registry:block"
  | "registry:ui"
  | "registry:component"
  | "registry:theme"
  | "registry:icon-set"
  | (string & {});

export type RegistryNodeRef = string;

export interface RegistryNode {
  /** e.g. database id */
  id: string;
  /** canonical ref, e.g. "@owner/name" or "@owner/name@1.0.0" */
  ref: RegistryNodeRef;
  type: RegistryType;
  /** raw registryDependencies as declared on this item/version */
  registryDependencies: string[];
}

export interface RegistryGraphEdge {
  from: RegistryNodeRef;
  to: RegistryNodeRef;
}

export interface RegistryGraph {
  nodes: Map<RegistryNodeRef, RegistryNode>;
  edges: Map<RegistryNodeRef, RegistryNodeRef[]>;
  /** edges that point to unknown nodes, useful for validation & diagnostics */
  danglingEdges: RegistryGraphEdge[];
}

export interface BuildGraphInputItem {
  id: string;
  ownerId: string | null;
  name: string;
  type: RegistryType;
  registryDependencies: string[] | null | undefined;
}

export function buildRegistryRef(ownerId: string | null, name: string): RegistryNodeRef {
  const owner = ownerId ?? "legacy";
  return `@${owner}/${name}`;
}

export function buildRegistryGraph(items: BuildGraphInputItem[]): RegistryGraph {
  // Note: edges use @owner/name only (version pins in refs are ignored). For
  // version-accurate graphs, use resolver/runtime paths instead of this helper.
  const nodes = new Map<RegistryNodeRef, RegistryNode>();
  const edges = new Map<RegistryNodeRef, RegistryNodeRef[]>();
  const danglingEdges: RegistryGraphEdge[] = [];

  for (const item of items) {
    const ref = buildRegistryRef(item.ownerId, item.name);
    const registryDependencies = Array.isArray(item.registryDependencies)
      ? item.registryDependencies.filter((d) => typeof d === "string" && d.trim().length > 0)
      : [];

    nodes.set(ref, {
      id: item.id,
      ref,
      type: item.type,
      registryDependencies,
    });
  }

  for (const node of nodes.values()) {
    const deps = node.registryDependencies;
    const out: RegistryNodeRef[] = [];

    for (const raw of deps) {
      const parsed = parseRegistryDependencyRef(raw);
      if (!parsed) continue;
      const keyWithoutVersion = `@${parsed.owner}/${parsed.name}` as RegistryNodeRef;

      if (nodes.has(keyWithoutVersion)) {
        out.push(keyWithoutVersion);
      } else {
        danglingEdges.push({
          from: node.ref,
          to: parsed.raw,
        });
      }
    }

    edges.set(node.ref, out);
  }

  return { nodes, edges, danglingEdges };
}

export interface ParsedRegistryDependencyRef {
  raw: string;
  owner: string;
  name: string;
  version: string | null;
}

export function parseRegistryDependencyRef(dep: string): ParsedRegistryDependencyRef | null {
  const m = dep.trim().match(/^@([^/@]+)\/([^@]+)(?:@(.+))?$/);
  if (!m) return null;
  return {
    raw: dep,
    owner: m[1],
    name: m[2],
    version: m[3] ?? null,
  };
}

export interface CollectOptions {
  filter?: (node: RegistryNode) => boolean;
}

export function collectTransitiveRegistryDeps(
  graph: RegistryGraph,
  rootRef: RegistryNodeRef,
  options?: CollectOptions,
): RegistryNode[] {
  const visited = new Set<RegistryNodeRef>();
  const result: RegistryNode[] = [];
  const { filter } = options ?? {};

  function dfs(ref: RegistryNodeRef) {
    if (visited.has(ref)) return;
    visited.add(ref);

    const node = graph.nodes.get(ref);
    if (!node) return;

    if (!filter || filter(node)) {
      result.push(node);
    }

    const outgoing = graph.edges.get(ref) ?? [];
    for (const next of outgoing) {
      dfs(next);
    }
  }

  dfs(rootRef);
  return result;
}

export interface RegistryCycle {
  path: RegistryNodeRef[];
}

export function findRegistryCycles(graph: RegistryGraph): RegistryCycle[] {
  const cycles: RegistryCycle[] = [];
  const tempStack = new Set<RegistryNodeRef>();
  const visited = new Set<RegistryNodeRef>();

  function dfs(ref: RegistryNodeRef, path: RegistryNodeRef[]) {
    if (tempStack.has(ref)) {
      const idx = path.indexOf(ref);
      if (idx >= 0) {
        cycles.push({ path: path.slice(idx) });
      }
      return;
    }
    if (visited.has(ref)) return;

    visited.add(ref);
    tempStack.add(ref);

    const outgoing = graph.edges.get(ref) ?? [];
    for (const next of outgoing) {
      dfs(next, [...path, next]);
    }

    tempStack.delete(ref);
  }

  for (const ref of graph.nodes.keys()) {
    if (!visited.has(ref)) {
      dfs(ref, [ref]);
    }
  }

  return cycles;
}

export function getPreviewThemeDepsInOrder(
  registryDependencies: string[] | null | undefined,
): ParsedRegistryDependencyRef[] {
  if (!Array.isArray(registryDependencies) || registryDependencies.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const result: ParsedRegistryDependencyRef[] = [];

  for (const raw of registryDependencies) {
    const parsed = parseRegistryDependencyRef(raw);
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed);
  }

  return result;
}
