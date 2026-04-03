export type RegistryScopedIdentity = {
  owner: string;
  project: string;
  name: string;
  version: string | null;
};

export function buildScopedRegistryRef(input: {
  owner: string;
  project: string;
  name: string;
  version?: string | null;
}) {
  const base = `@${input.owner}/${input.project}/${input.name}`;
  return input.version ? `${base}@${input.version}` : base;
}

export function buildScopedRegistryPath(input: {
  owner: string;
  project: string;
  name: string;
}) {
  return `/${encodeURIComponent(input.owner)}/${encodeURIComponent(
    input.project,
  )}/${encodeURIComponent(input.name)}`;
}

export function parseScopedRegistryRef(
  ref: string,
): RegistryScopedIdentity | null {
  const trimmed = ref.trim();
  const match = trimmed.match(/^@([^/@]+)\/([^/@]+)\/([^@]+?)(?:@(.+))?$/);
  if (!match) return null;

  return {
    owner: match[1],
    project: match[2],
    name: match[3],
    version: match[4] ?? null,
  };
}

export function hasScopedRegistryIdentity(ref: string) {
  return parseScopedRegistryRef(ref) != null;
}
