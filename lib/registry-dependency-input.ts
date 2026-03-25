import { parseRegistryDependencyRef } from "@/lib/registry-graph";

export function normalizeRegistryDependenciesInput(
  input: unknown,
): { value: string[]; error?: string } {
  if (input == null) return { value: [] };
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
        error: `Invalid registry dependency ref: ${dep}. Expected format @owner/name or @owner/name@version`,
      };
    }
    if (seen.has(dep)) continue;
    seen.add(dep);
    out.push(dep);
  }
  return { value: out };
}
