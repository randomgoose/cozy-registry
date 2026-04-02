import fs from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import {
  getPrebundleDependencies,
  type DependencyDecision,
} from "@/lib/third-party-dependency-governance";

export type PreviewDependencyResolutionSource = "provider" | "host-fallback";

export type PreviewDependencyResolution = {
  packageName: string;
  requestedVersion: string;
  resolutionSource: PreviewDependencyResolutionSource;
  packageRoot: string;
  packageJsonPath: string;
  moduleSearchPath: string;
};

export type PreviewDependencyResolutionDiagnostic = {
  packageName: string;
  requestedVersion: string;
  resolutionSource: PreviewDependencyResolutionSource;
  message: string;
};

const DEFAULT_PROVIDER_ROOT = path.join(
  os.tmpdir(),
  "cozy-preview-dependency-provider",
);

export async function resolvePreviewDependencies(params: {
  decisions: DependencyDecision[];
}): Promise<{
  nodePaths: string[];
  resolutions: PreviewDependencyResolution[];
  diagnostics: PreviewDependencyResolutionDiagnostic[];
}> {
  const appRequire = Module.createRequire(
    path.join(process.cwd(), "package.json"),
  );
  const byName = new Map(
    params.decisions.map((decision) => [decision.packageName, decision]),
  );
  const packageNames = getPrebundleDependencies(params.decisions);
  const nodePathSet = new Set<string>([path.join(process.cwd(), "node_modules")]);
  const resolutions: PreviewDependencyResolution[] = [];
  const diagnostics: PreviewDependencyResolutionDiagnostic[] = [];

  for (const packageName of packageNames) {
    const decision = byName.get(packageName);
    const requestedVersion = decision?.requestedVersion?.trim();
    if (!requestedVersion) continue;

    const providerResolution = await ensureProviderResolution({
      appRequire,
      packageName,
      requestedVersion,
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
    });
    resolutions.push(hostResolution);
    nodePathSet.add(hostResolution.moduleSearchPath);
    diagnostics.push({
      packageName,
      requestedVersion,
      resolutionSource: "host-fallback",
      message:
        "Resolved via host node_modules fallback because the controlled preview dependency provider does not yet supply this package version.",
    });
  }

  return {
    nodePaths: Array.from(nodePathSet),
    resolutions,
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
}): Promise<PreviewDependencyResolution | null> {
  const providerRoot = getPreviewDependencyProviderRoot();
  const existing = await tryResolveFromProvider({
    packageName: input.packageName,
    requestedVersion: input.requestedVersion,
    providerRoot,
  });
  if (existing) return existing;

  const seeded = await seedProviderFromHost({
    appRequire: input.appRequire,
    packageName: input.packageName,
    requestedVersion: input.requestedVersion,
    providerRoot,
  });
  if (!seeded) return null;

  return tryResolveFromProvider({
    packageName: input.packageName,
    requestedVersion: input.requestedVersion,
    providerRoot,
  });
}

async function resolveFromHost(input: {
  appRequire: NodeJS.Require;
  packageName: string;
  requestedVersion: string;
}): Promise<PreviewDependencyResolution> {
  const entryPath = input.appRequire.resolve(input.packageName);
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
}): Promise<boolean> {
  if (!isExactVersion(input.requestedVersion)) {
    return false;
  }

  const hostResolution = await resolveFromHost({
    appRequire: input.appRequire,
    packageName: input.packageName,
    requestedVersion: input.requestedVersion,
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
