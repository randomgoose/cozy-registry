export type DeclaredThirdPartyDependency = {
  name: string;
  version: string | null;
};

export function normalizeThirdPartyDependenciesInput(
  input: unknown,
): { value: DeclaredThirdPartyDependency[]; error?: string } {
  if (input === undefined) return { value: [] };
  if (input === null) {
    return {
      value: [],
      error:
        "dependencies cannot be null; omit the field or provide an array of dependency entries",
    };
  }
  if (!Array.isArray(input)) {
    return {
      value: [],
      error: "dependencies must be an array of strings or { name, version } objects",
    };
  }

  const out: DeclaredThirdPartyDependency[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const normalized = normalizeDeclaredDependency(raw);
    if ("error" in normalized) {
      return { value: [], error: normalized.error };
    }
    if (!normalized.value) continue;
    if (seen.has(normalized.value.name)) continue;
    seen.add(normalized.value.name);
    out.push(normalized.value);
  }

  return { value: out };
}

function normalizeDeclaredDependency(
  raw: unknown,
):
  | { value: DeclaredThirdPartyDependency }
  | { value: null }
  | { error: string } {
  if (typeof raw === "string") {
    const name = raw.trim();
    if (!name) return { value: null };
    return { value: { name, version: null } };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      error: "dependencies entries must be strings or objects with a name field",
    };
  }

  const rec = raw as Record<string, unknown>;
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!name) {
    return {
      error: "dependencies object entries must include a non-empty string name",
    };
  }

  const version =
    typeof rec.version === "string" && rec.version.trim().length > 0
      ? rec.version.trim()
      : null;

  return { value: { name, version } };
}
