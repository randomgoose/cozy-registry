import { parseRegistryDependencyRef } from "@/lib/registry-graph";

export function normalizeRegistryDependenciesInput(
  input: unknown,
): { value: string[]; error?: string } {
  if (input === undefined) return { value: [] };
  if (input === null) {
    return {
      value: [],
      error:
        "registryDependencies cannot be null; omit the field (inherit on update) or use [] to clear",
    };
  }
  if (!Array.isArray(input)) {
    return { value: [], error: "registryDependencies must be an array of strings" };
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") {
      return { value: [], error: "registryDependencies must contain only strings" };
    }
    const dep = raw.trim();
    if (!dep) continue;
    if (!parseRegistryDependencyRef(dep)) {
      return {
        value: [],
        error:
          `Invalid registry dependency ref: ${dep}. Expected format @owner/name, @owner/name@version, ` +
          `@owner/project/name, or @owner/project/name@version`,
      };
    }
    if (seen.has(dep)) continue;
    seen.add(dep);
    out.push(dep);
  }
  return { value: out };
}
