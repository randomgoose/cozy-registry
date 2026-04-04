function normalizeSpecifier(specifier: string): string {
  return specifier.trim();
}

export function isBundleRootAliasImport(specifier: string): boolean {
  return normalizeSpecifier(specifier).startsWith("@/");
}

export function isRelativeModuleSpecifier(specifier: string): boolean {
  const spec = normalizeSpecifier(specifier);
  return (
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec === "." ||
    spec === ".."
  );
}

export function isAbsoluteModuleSpecifier(specifier: string): boolean {
  return normalizeSpecifier(specifier).startsWith("/");
}

export function isLocalModuleSpecifier(specifier: string): boolean {
  const spec = normalizeSpecifier(specifier);
  return (
    spec.length > 0 &&
    (isRelativeModuleSpecifier(spec) ||
      isAbsoluteModuleSpecifier(spec) ||
      isBundleRootAliasImport(spec))
  );
}

export function isBarePackageSpecifier(specifier: string): boolean {
  const spec = normalizeSpecifier(specifier);
  return spec.length > 0 && !isLocalModuleSpecifier(spec);
}

export function resolveBundleRootAliasImport(specifier: string): string[] {
  const spec = normalizeSpecifier(specifier);
  if (!isBundleRootAliasImport(spec)) return [];
  const base = spec.slice(2);
  if (!base) return [];

  const hasExt = /\.[a-z0-9]+$/i.test(base);
  if (hasExt) return [base];

  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.css`,
    `${base}.json`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.css`,
    `${base}/index.json`,
  ];
}
