import fs from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import {
  getCompatibleArtifactDependencies,
  getDependencyProviderMode,
  getPrebundleDependencies,
  type DependencyDecision,
} from "@/lib/third-party-dependency-governance";

export type PreviewDependencyResolutionSource = "provider" | "host-fallback";

export type PreviewDependencyResolution = {
  packageName: string;
  requestedVersion: string;
  resolutionSource: PreviewDependencyResolutionSource;
  source: "provider-cache" | "host-fallback";
  packageRoot: string;
  packageJsonPath: string;
  moduleSearchPath: string;
};

export type PreviewDependencyResolutionDiagnostic = {
  packageName: string;
  requestedVersion: string;
  resolutionSource: PreviewDependencyResolutionSource;
  code: string;
  message: string;
  providerMode?: "managed-provider" | "compatible-external";
  hostFallbackUsed?: boolean;
};

export type PreviewCompatibleExternal = {
  packageName: string;
  requestedVersion: string | null;
  importMapTarget: string;
};

export type PreviewDependencyPlan = {
  managedPackages: PreviewDependencyResolution[];
  compatibleExternals: PreviewCompatibleExternal[];
  diagnostics: PreviewDependencyResolutionDiagnostic[];
};

const DEFAULT_PROVIDER_ROOT = path.join(
  os.tmpdir(),
  "cozy-preview-dependency-provider",
);

/**
 * Directories used as `paths` hints for resolving preview dependencies on the host.
 * Matches the same host hints as registry preview smoke / esbuild (`react` package dir + cwd `node_modules`).
 * sees the same layout as the esbuild `nodePaths` merge (pnpm / traced bundles often need the
 * react package directory, not only `cwd/node_modules`).
 */
export function getPreviewDependencyHostNodePaths(
  appRequire: NodeJS.Require = Module.createRequire(
    path.join(process.cwd(), "package.json"),
  ),
): string[] {
  const candidates = [path.join(process.cwd(), "node_modules")];
  try {
    const reactPkgJson = appRequire.resolve("react/package.json");
    candidates.push(path.dirname(reactPkgJson));
  } catch {
    /* react may be absent in exotic test harnesses */
  }
  return Array.from(new Set(candidates));
}

export async function resolvePreviewDependencies(params: {
  decisions: DependencyDecision[];
}): Promise<{
  nodePaths: string[];
  resolutions: PreviewDependencyResolution[];
  plan: PreviewDependencyPlan;
  diagnostics: PreviewDependencyResolutionDiagnostic[];
}> {
  const appRequire = Module.createRequire(
    path.join(process.cwd(), "package.json"),
  );
  const hostNodePaths = getPreviewDependencyHostNodePaths(appRequire);
  const byName = new Map(
    params.decisions.map((decision) => [decision.packageName, decision]),
  );
  const managedPackageNames = getPrebundleDependencies(params.decisions);
  const compatibleExternalNames = getCompatibleArtifactDependencies(
    params.decisions,
  );
  const nodePathSet = new Set<string>(hostNodePaths);
  const resolutions: PreviewDependencyResolution[] = [];
  const diagnostics: PreviewDependencyResolutionDiagnostic[] = [];
  const compatibleExternals: PreviewCompatibleExternal[] = compatibleExternalNames.map(
    (packageName) => {
      const decision = byName.get(packageName);
      return {
        packageName,
        requestedVersion: decision?.requestedVersion ?? null,
        importMapTarget: packageName,
      };
    },
  );

  for (const packageName of managedPackageNames) {
    const decision = byName.get(packageName);
    const requestedVersion = decision?.requestedVersion?.trim();
    if (!requestedVersion) continue;
    if (
      decision &&
      getDependencyProviderMode(decision) !== "managed-provider"
    ) {
      diagnostics.push({
        packageName,
        requestedVersion,
        resolutionSource: "provider",
        code: "COMPATIBLE_EXTERNAL_PLAN",
        providerMode: "compatible-external",
        message:
          "Compatible-external dependency does not require a physical provider package; artifact/runtime will keep it external.",
      });
      continue;
    }

    const providerResolution = await ensureProviderResolution({
      appRequire,
      packageName,
      requestedVersion,
      hostNodePaths,
    });

    if (providerResolution) {
      resolutions.push(providerResolution);
      nodePathSet.add(providerResolution.moduleSearchPath);
      continue;
    }

    const hostResolution = await resolveFromHost({
      appRequire,
      packageName,
      requestedVersion,
      hostNodePaths,
    });
    resolutions.push(hostResolution);
    nodePathSet.add(hostResolution.moduleSearchPath);
    diagnostics.push({
      packageName,
      requestedVersion,
      resolutionSource: "host-fallback",
      code: "HOST_FALLBACK_USED",
      providerMode: "managed-provider",
      hostFallbackUsed: true,
      message:
        "Resolved via host node_modules fallback because the controlled preview dependency provider does not yet supply this package version.",
    });
  }

  const remainingExternals: PreviewCompatibleExternal[] = [];
  for (const ext of compatibleExternals) {
    if (!ext.requestedVersion || !isExactVersion(ext.requestedVersion)) {
      remainingExternals.push(ext);
      continue;
    }

    const providerResolution = await ensureProviderResolution({
      appRequire,
      packageName: ext.packageName,
      requestedVersion: ext.requestedVersion,
      hostNodePaths,
      allowRegistryFetch: true,
    });

    if (providerResolution) {
      resolutions.push(providerResolution);
      nodePathSet.add(providerResolution.moduleSearchPath);
      diagnostics.push({
        packageName: ext.packageName,
        requestedVersion: ext.requestedVersion,
        resolutionSource: "provider",
        code: "COMPATIBLE_EXTERNAL_MATERIALIZED",
        providerMode: "compatible-external",
        message:
          "Compatible-external dependency was materialized into the provider and will be bundled.",
      });
    } else {
      remainingExternals.push(ext);
      diagnostics.push({
        packageName: ext.packageName,
        requestedVersion: ext.requestedVersion,
        resolutionSource: "provider",
        code: "COMPATIBLE_EXTERNAL_FALLBACK",
        providerMode: "compatible-external",
        message:
          "Compatible-external dependency could not be materialized; will use esm.sh import map fallback.",
      });
    }
  }

  return {
    nodePaths: Array.from(nodePathSet),
    resolutions,
    plan: {
      managedPackages: resolutions,
      compatibleExternals: remainingExternals,
      diagnostics,
    },
    diagnostics,
  };
}

async function tryResolveFromProvider(input: {
  packageName: string;
  requestedVersion: string;
  providerRoot?: string;
}): Promise<PreviewDependencyResolution | null> {
  const providerRoot = input.providerRoot ?? getPreviewDependencyProviderRoot();

  const packageRoot = path.join(
    providerRoot,
    encodeProviderPathSegment(input.packageName),
    input.requestedVersion,
    "node_modules",
    input.packageName,
  );
  const packageJsonPath = path.join(packageRoot, "package.json");

  try {
    await fs.access(packageJsonPath);
    return {
      packageName: input.packageName,
      requestedVersion: input.requestedVersion,
      resolutionSource: "provider",
      source: "provider-cache",
      packageRoot,
      packageJsonPath,
      moduleSearchPath: path.dirname(packageRoot),
    };
  } catch {
    return null;
  }
}

async function ensureProviderResolution(input: {
  appRequire: NodeJS.Require;
  packageName: string;
  requestedVersion: string;
  hostNodePaths: string[];
  allowRegistryFetch?: boolean;
}): Promise<PreviewDependencyResolution | null> {
  const providerRoot = getPreviewDependencyProviderRoot();
  const existing = await tryResolveFromProvider({
    packageName: input.packageName,
    requestedVersion: input.requestedVersion,
    providerRoot,
  });
  if (existing) return existing;

  try {
    const seeded = await seedProviderFromHost({
      appRequire: input.appRequire,
      packageName: input.packageName,
      requestedVersion: input.requestedVersion,
      providerRoot,
      hostNodePaths: input.hostNodePaths,
    });
    if (seeded) {
      return tryResolveFromProvider({
        packageName: input.packageName,
        requestedVersion: input.requestedVersion,
        providerRoot,
      });
    }
  } catch {
    /* package not on host — fall through to registry fetch */
  }

  if (input.allowRegistryFetch && isExactVersion(input.requestedVersion)) {
    const fetched = await materializeFromRegistry({
      packageName: input.packageName,
      requestedVersion: input.requestedVersion,
      providerRoot,
    });
    if (fetched) {
      return tryResolveFromProvider({
        packageName: input.packageName,
        requestedVersion: input.requestedVersion,
        providerRoot,
      });
    }
  }

  return null;
}

async function resolveFromHost(input: {
  appRequire: NodeJS.Require;
  packageName: string;
  requestedVersion: string;
  hostNodePaths: string[];
}): Promise<PreviewDependencyResolution> {
  let entryPath: string;
  try {
    entryPath = input.appRequire.resolve(input.packageName);
  } catch (primary) {
    try {
      entryPath = input.appRequire.resolve(input.packageName, {
        paths: input.hostNodePaths,
      });
    } catch {
      throw primary;
    }
  }
  const packageJsonPath = await findNearestPackageJson(entryPath);
  if (!packageJsonPath) {
    throw new Error(
      `Unable to resolve package.json for preview dependency "${input.packageName}" from host fallback.`,
    );
  }

  return {
    packageName: input.packageName,
    requestedVersion: input.requestedVersion,
    resolutionSource: "host-fallback",
    source: "host-fallback",
    packageRoot: path.dirname(packageJsonPath),
    packageJsonPath,
    moduleSearchPath: path.dirname(path.dirname(packageJsonPath)),
  };
}

function encodeProviderPathSegment(value: string) {
  return value.replaceAll("/", "__");
}

function getPreviewDependencyProviderRoot() {
  const configured = process.env.COZY_PREVIEW_DEPENDENCY_PROVIDER_ROOT?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_PROVIDER_ROOT;
}

async function seedProviderFromHost(input: {
  appRequire: NodeJS.Require;
  packageName: string;
  requestedVersion: string;
  providerRoot: string;
  hostNodePaths: string[];
}): Promise<boolean> {
  if (!isExactVersion(input.requestedVersion)) {
    return false;
  }

  const hostResolution = await resolveFromHost({
    appRequire: input.appRequire,
    packageName: input.packageName,
    requestedVersion: input.requestedVersion,
    hostNodePaths: input.hostNodePaths,
  });
  const hostManifest = await readPackageManifest(hostResolution.packageJsonPath);
  if (hostManifest.version !== input.requestedVersion) {
    return false;
  }

  const destinationNodeModulesRoot = path.join(
    input.providerRoot,
    encodeProviderPathSegment(input.packageName),
    input.requestedVersion,
    "node_modules",
  );

  await materializePackageTreeFromHost({
    appRequire: input.appRequire,
    packageName: input.packageName,
    packageJsonPath: hostResolution.packageJsonPath,
    destinationNodeModulesRoot,
    seen: new Set<string>(),
  });

  return true;
}

const REGISTRY_FETCH_TIMEOUT_MS = 30_000;

function isRegistryFetchEnabled(): boolean {
  const flag = process.env.COZY_PREVIEW_REGISTRY_FETCH?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return false;
  return true;
}

async function materializeFromRegistry(input: {
  packageName: string;
  requestedVersion: string;
  providerRoot: string;
}): Promise<boolean> {
  if (!isRegistryFetchEnabled()) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pacote = require("pacote") as {
      extract: (
        spec: string,
        dest: string,
        opts?: Record<string, unknown>,
      ) => Promise<unknown>;
      manifest: (
        spec: string,
        opts?: Record<string, unknown>,
      ) => Promise<{ version?: string }>;
    };

    const destinationNodeModulesRoot = path.join(
      input.providerRoot,
      encodeProviderPathSegment(input.packageName),
      input.requestedVersion,
      "node_modules",
    );

    const seen = new Set<string>();

    await materializePackageTreeFromRegistry({
      pacote,
      packageName: input.packageName,
      version: input.requestedVersion,
      destinationNodeModulesRoot,
      seen,
    });

    return true;
  } catch {
    return false;
  }
}

async function materializePackageTreeFromRegistry(input: {
  pacote: {
    extract: (
      spec: string,
      dest: string,
      opts?: Record<string, unknown>,
    ) => Promise<unknown>;
    manifest: (
      spec: string,
      opts?: Record<string, unknown>,
    ) => Promise<{ version?: string }>;
  };
  packageName: string;
  version: string;
  destinationNodeModulesRoot: string;
  seen: Set<string>;
}): Promise<void> {
  const seenKey = `${input.packageName}@${input.version}`;
  if (input.seen.has(seenKey)) return;
  input.seen.add(seenKey);

  const destinationPackageRoot = path.join(
    input.destinationNodeModulesRoot,
    input.packageName,
  );
  const destinationPackageJson = path.join(destinationPackageRoot, "package.json");

  if (!(await fileExists(destinationPackageJson))) {
    await fs.mkdir(path.dirname(destinationPackageRoot), { recursive: true });
    await input.pacote.extract(
      `${input.packageName}@${input.version}`,
      destinationPackageRoot,
      { timeout: REGISTRY_FETCH_TIMEOUT_MS },
    );
  }

  let manifest: { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
  try {
    manifest = await readPackageManifest(destinationPackageJson);
  } catch {
    return;
  }

  const optionalDepNames = new Set(
    Object.keys(manifest.optionalDependencies ?? {}),
  );
  const dependencyEntries = [
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.optionalDependencies ?? {}),
  ];

  for (const [depName, depRange] of dependencyEntries) {
    const trimmedRange = depRange.trim();
    if (!trimmedRange) continue;

    let resolvedVersion: string;
    if (isExactVersion(trimmedRange)) {
      resolvedVersion = trimmedRange;
    } else {
      try {
        const picked = await input.pacote.manifest(
          `${depName}@${trimmedRange}`,
          { timeout: REGISTRY_FETCH_TIMEOUT_MS },
        );
        const v = picked.version;
        if (typeof v !== "string" || !v.trim()) {
          throw new Error(`registry manifest for "${depName}" has no version`);
        }
        resolvedVersion = v.trim();
      } catch {
        if (optionalDepNames.has(depName)) continue;
        throw new Error(
          `Failed to resolve "${depName}@${trimmedRange}" while materializing preview dependencies from the registry.`,
        );
      }
    }

    await materializePackageTreeFromRegistry({
      pacote: input.pacote,
      packageName: depName,
      version: resolvedVersion,
      destinationNodeModulesRoot: input.destinationNodeModulesRoot,
      seen: input.seen,
    });
  }
}

async function materializePackageTreeFromHost(input: {
  appRequire: NodeJS.Require;
  packageName: string;
  packageJsonPath: string;
  destinationNodeModulesRoot: string;
  seen: Set<string>;
}): Promise<void> {
  const manifest = await readPackageManifest(input.packageJsonPath);
  const seenKey = `${input.packageName}@${manifest.version}`;
  if (input.seen.has(seenKey)) {
    return;
  }
  input.seen.add(seenKey);

  const sourcePackageRoot = await fs.realpath(path.dirname(input.packageJsonPath));
  const destinationPackageRoot = path.join(
    input.destinationNodeModulesRoot,
    input.packageName,
  );
  const destinationPackageJsonPath = path.join(destinationPackageRoot, "package.json");

  if (!(await fileExists(destinationPackageJsonPath))) {
    await fs.mkdir(path.dirname(destinationPackageRoot), { recursive: true });
    await fs.cp(sourcePackageRoot, destinationPackageRoot, {
      recursive: true,
      force: true,
      filter(source) {
        return path.basename(source) !== "node_modules";
      },
    });
  }

  const dependencyNames = [
    ...Object.keys(
      typeof manifest.dependencies === "object" && manifest.dependencies
        ? manifest.dependencies
        : {},
    ),
    ...Object.keys(
      typeof manifest.optionalDependencies === "object" && manifest.optionalDependencies
        ? manifest.optionalDependencies
        : {},
    ),
  ].sort();

  for (const dependencyName of dependencyNames) {
    let dependencyEntryPath: string;
    try {
      dependencyEntryPath = input.appRequire.resolve(dependencyName, {
        paths: [sourcePackageRoot],
      });
    } catch {
      continue;
    }
    const dependencyPackageJsonPath =
      await findNearestPackageJson(dependencyEntryPath);
    if (!dependencyPackageJsonPath) {
      continue;
    }

    await materializePackageTreeFromHost({
      appRequire: input.appRequire,
      packageName: dependencyName,
      packageJsonPath: dependencyPackageJsonPath,
      destinationNodeModulesRoot: input.destinationNodeModulesRoot,
      seen: input.seen,
    });
  }
}

async function readPackageManifest(packageJsonPath: string): Promise<{
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}> {
  const raw = await fs.readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as {
    version?: unknown;
    dependencies?: unknown;
    optionalDependencies?: unknown;
  };
  return {
    version: typeof parsed.version === "string" ? parsed.version.trim() : "",
    dependencies:
      parsed.dependencies && typeof parsed.dependencies === "object" && !Array.isArray(parsed.dependencies)
        ? (parsed.dependencies as Record<string, string>)
        : undefined,
    optionalDependencies:
      parsed.optionalDependencies &&
      typeof parsed.optionalDependencies === "object" &&
      !Array.isArray(parsed.optionalDependencies)
        ? (parsed.optionalDependencies as Record<string, string>)
        : undefined,
  };
}

function isExactVersion(version: string) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

async function fileExists(candidatePath: string) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
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
      if (parent === current) return null;
      current = parent;
    }
  }
}
