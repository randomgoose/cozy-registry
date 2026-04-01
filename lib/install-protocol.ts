import fs from "fs/promises";
import path from "path";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import { sha256Utf8, type CozyProvenanceManifestV1 } from "@/lib/cozy-provenance";
import {
  getDefaultInstallDir,
  normalizeInstallFilePath,
  pickInstallEntryPath,
  rewriteInstalledRegistryImports,
  type InstallDependencyTarget,
} from "@/lib/registry-install-layout";

export type RegistryCoordinate =
  // Owner-scoped coordinate (legacy / global): @owner/name
  | `@${string}/${string}`
  // Project-scoped coordinate (project-first): @owner/project/name
  | `@${string}/${string}/${string}`;

export type CozyLockfile = {
  version: 1;
  items: Record<RegistryCoordinate, CozyLockfileItem>;
};

export type CozyLockfileItem = {
  type: string;
  version: string;
  source: string;
  installedFiles: string[];
  installedAt?: string;
  registryDependencies?: string[];
  themeDependencies?: string[];
  meta?: Record<string, unknown>;
};

export type ProjectRegistryStatusItem = {
  coordinate: RegistryCoordinate;
  type: string;
  version: string;
  source: string;
  installedFiles: string[];
};

export type CheckInstalledItemResult = {
  ok: true;
  item: {
    coordinate: RegistryCoordinate;
    type: string;
    installedVersion: string;
    latestVersion: string;
    upgradable: boolean;
    hasConflicts: boolean;
    source: string;
    installedFiles: string[];
  };
  summary: string;
};

export type InstallRegistryItemResult = {
  ok: true;
  action: "add";
  coordinate: RegistryCoordinate;
  version: string;
  status: "installed";
  projectRoot: string;
  lockfilePath: string;
  lockfileUpdated: true;
  protocolApplied: true;
  entryCoordinate: RegistryCoordinate;
  installedFiles: string[];
  changedFiles: string[];
  unchangedFiles: string[];
};

export type ProjectRegistryStatusResult = {
  ok: true;
  projectRoot: string;
  lockfilePath: string;
  lockfileExists: boolean;
  itemCount: number;
  items: ProjectRegistryStatusItem[];
  summary: string;
};

export type UpgradeInstalledItemResult =
  | {
      ok: true;
      action: "upgrade";
      coordinate: RegistryCoordinate;
      fromVersion: string;
      toVersion: string;
      status: "upgraded" | "already_up_to_date";
      forced: boolean;
      changedFiles: string[];
      unchangedFiles: string[];
    }
  | {
      ok: false;
      action: "upgrade";
      coordinate: RegistryCoordinate;
      fromVersion: string;
      toVersion: string;
      status: "blocked_by_conflicts" | "failed";
      forced: boolean;
      conflictedFiles: string[];
      safeToReplaceFiles: string[];
      message: string;
    };

type RegistryBundleFile = {
  path: string;
  content: string;
  type: string;
};

type RegistryBundle = {
  name: string;
  type: string;
  files: RegistryBundleFile[];
  registryDependencies?: string[];
};

type FetchLike = typeof fetch;

const LOCKFILE_NAME = "cozy-registry.lock.json";
const PROVENANCE_FILE_NAME = "cozy.provenance.json";
async function writeProvenanceManifest(params: {
  projectRoot: string;
  installBaseDir: string;
  coordinate: RegistryCoordinate;
  version: string;
  files: Array<{ projectRelative: string; originalPath: string; content: string }>;
}): Promise<{ projectRelativePath: string; changed: boolean }> {
  const manifest: CozyProvenanceManifestV1 = {
    schemaVersion: 1,
    root: { ref: params.coordinate, version: params.version },
    files: params.files.map((f) => ({
      path: f.projectRelative,
      source: "registry" as const,
      ref: `${params.coordinate}@${params.version}`,
      originalPath: f.originalPath,
      contentHash: sha256Utf8(f.content),
    })),
  };

  const projectRelativePath = normalizePosix(
    path.posix.join(params.installBaseDir, PROVENANCE_FILE_NAME),
  );
  const absolutePath = path.join(params.projectRoot, projectRelativePath);
  const next = `${JSON.stringify(manifest, null, 2)}\n`;

  let previous = "";
  try {
    previous = await fs.readFile(absolutePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  if (previous === next) {
    return { projectRelativePath, changed: false };
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, next, "utf8");
  return { projectRelativePath, changed: true };
}

export function getLockfilePath(projectRoot: string): string {
  return path.join(projectRoot, LOCKFILE_NAME);
}

export function validateProjectRoot(projectRoot: string): string {
  const trimmed = projectRoot.trim();
  if (!trimmed) {
    throw new Error(
      "projectRoot is required and must point to the target project's absolute root path.",
    );
  }

  if (!path.isAbsolute(trimmed)) {
    throw new Error(
      `projectRoot must be an absolute path. Received: ${projectRoot}`,
    );
  }

  if (trimmed === path.parse(trimmed).root) {
    throw new Error(
      "projectRoot cannot be the filesystem root. Pass the actual writable project directory, for example /workspace/my-app.",
    );
  }

  return trimmed;
}

export async function readLockfile(projectRoot: string): Promise<CozyLockfile> {
  const validatedProjectRoot = validateProjectRoot(projectRoot);
  const lockfilePath = getLockfilePath(validatedProjectRoot);
  try {
    const raw = await fs.readFile(lockfilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CozyLockfile>;
    return normalizeLockfile(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, items: {} };
    }
    throw err;
  }
}

export async function lockfileExists(projectRoot: string): Promise<boolean> {
  const validatedProjectRoot = validateProjectRoot(projectRoot);
  try {
    await fs.access(getLockfilePath(validatedProjectRoot));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

export async function writeLockfile(
  projectRoot: string,
  lockfile: CozyLockfile,
): Promise<void> {
  const validatedProjectRoot = validateProjectRoot(projectRoot);
  const lockfilePath = getLockfilePath(validatedProjectRoot);
  const next = normalizeLockfile(lockfile);
  await fs.writeFile(lockfilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function upsertLockfileItem(params: {
  projectRoot: string;
  coordinate: RegistryCoordinate;
  item: CozyLockfileItem;
}): Promise<CozyLockfile> {
  const lockfile = await readLockfile(params.projectRoot);
  lockfile.items[params.coordinate] = params.item;
  await writeLockfile(params.projectRoot, lockfile);
  return lockfile;
}

export async function checkInstalledItemUpdate(params: {
  projectRoot: string;
  coordinate: RegistryCoordinate;
  registryBaseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<CheckInstalledItemResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const lockfile = await readLockfile(params.projectRoot);
  const lockItem = lockfile.items[params.coordinate];
  if (!lockItem) {
    throw new Error(`Installed item not found in lockfile: ${params.coordinate}`);
  }

  return checkRegistryStatusItemUpdate({
    item: {
      coordinate: params.coordinate,
      type: lockItem.type,
      version: lockItem.version,
      source: lockItem.source,
      installedFiles: lockItem.installedFiles,
    },
    registryBaseUrl: params.registryBaseUrl,
    fetchImpl,
  });
}

export async function checkRegistryStatusItemUpdate(params: {
  item: ProjectRegistryStatusItem;
  registryBaseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<CheckInstalledItemResult> {
  const fetchImpl = params.fetchImpl ?? fetch;

  const latestVersion = await fetchLatestVersion({
    coordinate: params.item.coordinate,
    source: params.item.source,
    registryBaseUrl: params.registryBaseUrl,
    fetchImpl,
  });

  const upgradable = latestVersion !== params.item.version;
  return {
    ok: true,
    item: {
      coordinate: params.item.coordinate,
      type: params.item.type,
      installedVersion: params.item.version,
      latestVersion,
      upgradable,
      hasConflicts: false,
      source: params.item.source,
      installedFiles: params.item.installedFiles,
    },
    summary: upgradable
      ? `Upgradable from v${params.item.version} to v${latestVersion}.`
      : `Already up to date at v${params.item.version}.`,
  };
}

export async function installRegistryBundle(params: {
  projectRoot: string;
  coordinate: RegistryCoordinate;
  type: string;
  version: string;
  source: string;
  files: RegistryBundleFile[];
  /** Optional: registryDependencies declared by the installed item. */
  registryDependencies?: string[];
  registryBaseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<InstallRegistryItemResult> {
  const validatedProjectRoot = validateProjectRoot(params.projectRoot);
  const fetchImpl = params.fetchImpl ?? fetch;
  const state: InstallTraversalState = {
    projectRoot: validatedProjectRoot,
    registryBaseUrl: params.registryBaseUrl,
    fetchImpl,
    changedFiles: [],
    unchangedFiles: [],
    visited: new Set<string>(),
  };

  const rootInstall = await installRegistryBundleNode(
    {
      coordinate: params.coordinate,
      type: params.type,
      version: params.version,
      source: params.source,
      files: params.files,
      registryDependencies: params.registryDependencies ?? [],
    },
    state,
  );

  return {
    ok: true,
    action: "add",
    coordinate: params.coordinate,
    version: params.version,
    status: "installed",
    projectRoot: validatedProjectRoot,
    lockfilePath: getLockfilePath(validatedProjectRoot),
    lockfileUpdated: true,
    protocolApplied: true,
    entryCoordinate: params.coordinate,
    installedFiles: rootInstall.installedFiles,
    changedFiles: state.changedFiles,
    unchangedFiles: state.unchangedFiles,
  };
}

export async function getProjectRegistryStatus(params: {
  projectRoot: string;
  coordinate?: RegistryCoordinate;
}): Promise<ProjectRegistryStatusResult> {
  const validatedProjectRoot = validateProjectRoot(params.projectRoot);
  const exists = await lockfileExists(validatedProjectRoot);
  const lockfile = await readLockfile(validatedProjectRoot);
  const items = Object.entries(lockfile.items)
    .filter(([coordinate]) =>
      params.coordinate ? coordinate === params.coordinate : true,
    )
    .map(([coordinate, item]) => ({
      coordinate: coordinate as RegistryCoordinate,
      type: item.type,
      version: item.version,
      source: item.source,
      installedFiles: item.installedFiles,
    }));

  const summary = !exists
    ? "cozy-registry.lock.json is missing."
    : items.length === 0
      ? "cozy-registry.lock.json exists but no installed items are registered."
      : `Found ${items.length} installed item${items.length === 1 ? "" : "s"} in cozy-registry.lock.json.`;

  return {
    ok: true,
    projectRoot: validatedProjectRoot,
    lockfilePath: getLockfilePath(validatedProjectRoot),
    lockfileExists: exists,
    itemCount: items.length,
    items,
    summary,
  };
}

export async function upgradeInstalledItem(params: {
  projectRoot: string;
  coordinate: RegistryCoordinate;
  toVersion?: string;
  registryBaseUrl?: string;
  fetchImpl?: FetchLike;
  force?: boolean;
}): Promise<UpgradeInstalledItemResult> {
  const validatedProjectRoot = validateProjectRoot(params.projectRoot);
  const fetchImpl = params.fetchImpl ?? fetch;
  const lockfile = await readLockfile(validatedProjectRoot);
  const lockItem = lockfile.items[params.coordinate];
  if (!lockItem) {
    throw new Error(`Installed item not found in lockfile: ${params.coordinate}`);
  }

  const targetVersion =
    params.toVersion ??
    (await fetchLatestVersion({
      coordinate: params.coordinate,
      source: lockItem.source,
      registryBaseUrl: params.registryBaseUrl,
      fetchImpl,
    }));

  if (targetVersion === lockItem.version) {
    return {
      ok: true,
      action: "upgrade",
      coordinate: params.coordinate,
      fromVersion: lockItem.version,
      toVersion: targetVersion,
      status: "already_up_to_date",
      forced: !!params.force,
      changedFiles: [],
      unchangedFiles: lockItem.installedFiles,
    };
  }

  const baselineBundle = await fetchRegistryBundle({
    coordinate: params.coordinate,
    source: lockItem.source,
    version: lockItem.version,
    registryBaseUrl: params.registryBaseUrl,
    fetchImpl,
  });
  const targetBundle = await fetchRegistryBundle({
    coordinate: params.coordinate,
    source: lockItem.source,
    version: targetVersion,
    registryBaseUrl: params.registryBaseUrl,
    fetchImpl,
  });

  const conflictCheck = await detectUpgradeConflicts({
    projectRoot: validatedProjectRoot,
    coordinate: params.coordinate,
    installedFiles: lockItem.installedFiles,
    baselineBundle,
  });

  if (conflictCheck.conflictedFiles.length > 0 && !params.force) {
    return {
      ok: false,
      action: "upgrade",
      coordinate: params.coordinate,
      fromVersion: lockItem.version,
      toVersion: targetVersion,
      status: "blocked_by_conflicts",
      forced: false,
      conflictedFiles: conflictCheck.conflictedFiles,
      safeToReplaceFiles: conflictCheck.safeToReplaceFiles,
      message: "Upgrade stopped because local modifications were detected.",
    };
  }

  const state: InstallTraversalState = {
    projectRoot: validatedProjectRoot,
    registryBaseUrl: params.registryBaseUrl,
    fetchImpl,
    changedFiles: [],
    unchangedFiles: [],
    visited: new Set<string>(),
  };

  await installRegistryBundleNode(
    {
      coordinate: params.coordinate,
      type: targetBundle.type,
      version: targetVersion,
      source: buildVersionedSourceUrl({
        coordinate: params.coordinate,
        source: lockItem.source,
        version: targetVersion,
        registryBaseUrl: params.registryBaseUrl,
      }),
      files: targetBundle.files,
      registryDependencies: targetBundle.registryDependencies ?? [],
    },
    state,
  );

  return {
    ok: true,
    action: "upgrade",
    coordinate: params.coordinate,
    fromVersion: lockItem.version,
    toVersion: targetVersion,
    status: "upgraded",
    forced: !!params.force,
    changedFiles: state.changedFiles,
    unchangedFiles: state.unchangedFiles,
  };
}

type InstallTraversalState = {
  projectRoot: string;
  registryBaseUrl?: string;
  fetchImpl: FetchLike;
  changedFiles: string[];
  unchangedFiles: string[];
  visited: Set<string>;
};

type InstallRegistryBundleNodeInput = {
  coordinate: RegistryCoordinate;
  type: string;
  version: string;
  source: string;
  files: RegistryBundleFile[];
  registryDependencies: string[];
};

async function installRegistryBundleNode(
  params: InstallRegistryBundleNodeInput,
  state: InstallTraversalState,
): Promise<{ installedFiles: string[] }> {
  const visitKey = `${params.coordinate}@${params.version}`;
  if (state.visited.has(visitKey)) {
    const { owner, name, projectSlug } = parseCoordinate(params.coordinate);
    const installBaseDir = getDefaultInstallDir({ owner, name, projectSlug });
    return {
      installedFiles: params.files.map((file) =>
        normalizePosix(path.posix.join(installBaseDir, normalizeInstallFilePath(file.path))),
      ),
    };
  }
  state.visited.add(visitKey);

  const dependencyTargets = await installRegistryDependenciesFlat({
    rootSource: params.source,
    dependencies: params.registryDependencies,
    state,
  });

  const { owner, name, projectSlug } = parseCoordinate(params.coordinate);
  const installBaseDir = getDefaultInstallDir({ owner, name, projectSlug });
  const rewrittenFiles = rewriteInstalledRegistryImports({
    files: params.files.map((file) => ({
      ...file,
      path: normalizeInstallFilePath(file.path),
    })),
    rootOwner: owner,
    rootName: name,
    dependencyTargets,
  });

  const provenanceInputFiles: Array<{
    projectRelative: string;
    originalPath: string;
    content: string;
  }> = [];

  for (const file of rewrittenFiles) {
    const projectRelative = normalizePosix(
      path.posix.join(installBaseDir, normalizeInstallFilePath(file.path)),
    );
    const absolutePath = path.join(state.projectRoot, projectRelative);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    let previous = "";
    try {
      previous = await fs.readFile(absolutePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    if (previous === file.content) {
      state.unchangedFiles.push(projectRelative);
    } else {
      await fs.writeFile(absolutePath, file.content, "utf8");
      state.changedFiles.push(projectRelative);
    }

    provenanceInputFiles.push({
      projectRelative,
      originalPath: normalizePosix(file.path),
      content: file.content,
    });
  }

  const provenanceWrite = await writeProvenanceManifest({
    projectRoot: state.projectRoot,
    installBaseDir,
    coordinate: params.coordinate,
    version: params.version,
    files: provenanceInputFiles,
  });
  if (provenanceWrite.changed) state.changedFiles.push(provenanceWrite.projectRelativePath);
  else state.unchangedFiles.push(provenanceWrite.projectRelativePath);

  const installedFiles = rewrittenFiles.map((file) =>
    normalizePosix(path.posix.join(installBaseDir, normalizeInstallFilePath(file.path))),
  );

  await upsertLockfileItem({
    projectRoot: state.projectRoot,
    coordinate: params.coordinate,
    item: buildLockfileItem({
      type: params.type,
      version: params.version,
      source: params.source,
      installedFiles,
      registryDependencies: params.registryDependencies,
    }),
  });

  return { installedFiles };
}

async function installRegistryDependenciesFlat(params: {
  rootSource: string;
  dependencies: string[];
  state: InstallTraversalState;
}): Promise<Map<string, InstallDependencyTarget>> {
  const out = new Map<string, InstallDependencyTarget>();
  const byName = new Map<string, InstallDependencyTarget[]>();
  const base = resolveBaseUrl(params.rootSource, params.state.registryBaseUrl);

  for (const raw of params.dependencies) {
    const parsed = parseRegistryDependencyRef(raw);
    if (!parsed) continue;

    const coordinate = `@${parsed.owner}/${parsed.name}` as RegistryCoordinate;
    const source = new URL(
      `/api/r/${encodeURIComponent(parsed.owner)}/${parsed.name}`,
      base,
    ).toString();
    const version =
      parsed.version ??
      (await fetchLatestVersion({
        coordinate,
        source,
        registryBaseUrl: params.state.registryBaseUrl,
        fetchImpl: params.state.fetchImpl,
      }));

    const bundle = await fetchRegistryBundle({
      coordinate,
      source,
      version,
      registryBaseUrl: params.state.registryBaseUrl,
      fetchImpl: params.state.fetchImpl,
    });

    const entryPath = pickInstallEntryPath(bundle.files);
    const target: InstallDependencyTarget = {
      owner: parsed.owner,
      name: parsed.name,
      version,
      entryPath,
    };
    out.set(raw.trim(), target);
    out.set(`@${parsed.owner}/${parsed.name}`, target);
    out.set(`@${parsed.owner}/${parsed.name}@${version}`, target);

    const list = byName.get(parsed.name) ?? [];
    list.push(target);
    byName.set(parsed.name, list);

    await installRegistryBundleNode(
      {
        coordinate,
        type: bundle.type,
        version,
        source: buildVersionedSourceUrl({
          coordinate,
          source,
          version,
          registryBaseUrl: params.state.registryBaseUrl,
        }),
        files: bundle.files,
        registryDependencies: bundle.registryDependencies ?? [],
      },
      params.state,
    );
  }

  for (const [name, matches] of byName) {
    if (matches.length === 1) {
      out.set(name, matches[0]);
    }
  }

  return out;
}

export async function detectUpgradeConflicts(params: {
  projectRoot: string;
  coordinate: RegistryCoordinate;
  installedFiles: string[];
  baselineBundle: RegistryBundle;
}): Promise<{
  conflictedFiles: string[];
  safeToReplaceFiles: string[];
}> {
  const validatedProjectRoot = validateProjectRoot(params.projectRoot);
  const { owner, name, projectSlug } = parseCoordinate(params.coordinate);
  const installBaseDir = getDefaultInstallDir({ owner, name, projectSlug });
  const baselineMap = new Map(
    params.baselineBundle.files.map((file) => [
      normalizePosix(path.posix.join(installBaseDir, normalizeInstallFilePath(file.path))),
      file.content,
    ]),
  );

  const conflictedFiles: string[] = [];
  const safeToReplaceFiles: string[] = [];

  for (const installedFile of params.installedFiles) {
    const normalizedInstalled = normalizePosix(installedFile);
    const expected = baselineMap.get(normalizedInstalled);
    if (expected == null) {
      conflictedFiles.push(normalizedInstalled);
      continue;
    }

    const absolutePath = path.join(validatedProjectRoot, normalizedInstalled);
    let current = "";
    try {
      current = await fs.readFile(absolutePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        conflictedFiles.push(normalizedInstalled);
        continue;
      }
      throw err;
    }

    if (current === expected) {
      safeToReplaceFiles.push(normalizedInstalled);
    } else {
      conflictedFiles.push(normalizedInstalled);
    }
  }

  return {
    conflictedFiles: conflictedFiles.sort(),
    safeToReplaceFiles: safeToReplaceFiles.sort(),
  };
}

export function buildLockfileItem(params: {
  type: string;
  version: string;
  source: string;
  installedFiles: string[];
  registryDependencies?: string[];
  themeDependencies?: string[];
  meta?: Record<string, unknown>;
}): CozyLockfileItem {
  return {
    type: params.type,
    version: params.version,
    source: params.source,
    installedFiles: params.installedFiles.map(normalizePosix),
    installedAt: new Date().toISOString(),
    registryDependencies:
      Array.isArray(params.registryDependencies) &&
      params.registryDependencies.length > 0
        ? params.registryDependencies
            .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
            .map((d) => d.trim())
        : undefined,
    themeDependencies:
      Array.isArray(params.themeDependencies) && params.themeDependencies.length > 0
        ? params.themeDependencies
            .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
            .map((d) => d.trim())
        : undefined,
    meta: params.meta,
  };
}

function normalizeLockfile(input: Partial<CozyLockfile>): CozyLockfile {
  const nextItems: Record<RegistryCoordinate, CozyLockfileItem> = {} as Record<
    RegistryCoordinate,
    CozyLockfileItem
  >;
  for (const [coordinate, item] of Object.entries(input.items ?? {})) {
    if (!item || typeof item !== "object") continue;
    nextItems[coordinate as RegistryCoordinate] = {
      type: typeof item.type === "string" ? item.type : "registry:block",
      version: typeof item.version === "string" ? item.version : "0.1.0",
      source: typeof item.source === "string" ? item.source : "",
      installedFiles: Array.isArray(item.installedFiles)
        ? item.installedFiles.filter((file): file is string => typeof file === "string").map(normalizePosix)
        : [],
      installedAt: typeof item.installedAt === "string" ? item.installedAt : undefined,
      registryDependencies: Array.isArray(item.registryDependencies)
        ? item.registryDependencies.filter((entry): entry is string => typeof entry === "string")
        : undefined,
      themeDependencies: Array.isArray(item.themeDependencies)
        ? item.themeDependencies.filter((entry): entry is string => typeof entry === "string")
        : undefined,
      meta:
        item.meta && typeof item.meta === "object"
          ? (item.meta as Record<string, unknown>)
          : undefined,
    };
  }

  return {
    version: 1,
    items: nextItems,
  };
}

function parseCoordinate(coordinate: RegistryCoordinate): {
  owner: string;
  name: string;
  projectSlug: string | null;
} {
  const trimmed = coordinate.trim();
  if (!trimmed.startsWith("@")) {
    throw new Error(`Invalid registry coordinate: ${coordinate}`);
  }
  const rest = trimmed.slice(1);
  const parts = rest.split("/");
  if (parts.length === 3) {
    return { owner: parts[0], projectSlug: parts[1], name: parts[2] };
  }
  if (parts.length === 2) {
    return { owner: parts[0], projectSlug: null, name: parts[1] };
  }
  throw new Error(`Invalid registry coordinate: ${coordinate}`);
}

async function fetchLatestVersion(params: {
  coordinate: RegistryCoordinate;
  source: string;
  registryBaseUrl?: string;
  fetchImpl: FetchLike;
}): Promise<string> {
  const parsed = parseCoordinate(params.coordinate);
  const { owner, name } = parsed;
  const versionsUrl = buildVersionsUrl({
    source: params.source,
    owner,
    name,
    projectSlug: parsed.projectSlug,
    registryBaseUrl: params.registryBaseUrl,
  });
  const response = await params.fetchImpl(versionsUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch versions: ${response.status} ${versionsUrl}`);
  }
  const payload = (await response.json()) as {
    currentVersion?: string;
    versions?: Array<{ version?: string }>;
  };
  return (
    payload.currentVersion ??
    payload.versions?.[0]?.version ??
    (() => {
      throw new Error(`No current version found for ${params.coordinate}`);
    })()
  );
}

async function fetchRegistryBundle(params: {
  coordinate: RegistryCoordinate;
  source: string;
  version: string;
  registryBaseUrl?: string;
  fetchImpl: FetchLike;
}): Promise<RegistryBundle> {
  const url = buildVersionedSourceUrl({
    coordinate: params.coordinate,
    source: params.source,
    version: params.version,
    registryBaseUrl: params.registryBaseUrl,
  });
  const response = await params.fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch registry bundle: ${response.status} ${url}`);
  }
  const payload = (await response.json()) as Partial<RegistryBundle>;
  return {
    name: typeof payload.name === "string" ? payload.name : parseCoordinate(params.coordinate).name,
    type: typeof payload.type === "string" ? payload.type : "registry:block",
    files: Array.isArray(payload.files)
      ? payload.files.filter(isBundleFile)
      : [],
    registryDependencies: Array.isArray(payload.registryDependencies)
      ? payload.registryDependencies.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
  };
}

function isBundleFile(value: unknown): value is RegistryBundleFile {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.path === "string" &&
    typeof rec.content === "string" &&
    typeof rec.type === "string"
  );
}

function buildVersionsUrl(params: {
  source: string;
  owner: string;
  name: string;
  projectSlug?: string | null;
  registryBaseUrl?: string;
}): string {
  const base = resolveBaseUrl(params.source, params.registryBaseUrl);
  const url = new URL(
    `/api/registry/${encodeURIComponent(params.owner)}/${params.name}/versions`,
    base,
  );
  if (params.projectSlug) {
    url.searchParams.set("project", params.projectSlug);
  }
  return url.toString();
}

function buildVersionedSourceUrl(params: {
  coordinate: RegistryCoordinate;
  source: string;
  version: string;
  registryBaseUrl?: string;
}): string {
  const parsed = parseCoordinate(params.coordinate);
  const base = resolveBaseUrl(params.source, params.registryBaseUrl);
  const sourceUrl = new URL(resolveSourceUrl(params.source, params.registryBaseUrl), base);
  sourceUrl.searchParams.set("v", params.version);
  if (parsed.projectSlug) {
    sourceUrl.searchParams.set("project", parsed.projectSlug);
  }
  return sourceUrl.toString();
}

function resolveSourceUrl(source: string, registryBaseUrl?: string): string {
  if (/^https?:\/\//i.test(source)) return source;
  const base = resolveBaseUrl(source, registryBaseUrl);
  return new URL(source, base).toString();
}

function resolveBaseUrl(source: string, registryBaseUrl?: string): string {
  if (registryBaseUrl) return registryBaseUrl;
  if (/^https?:\/\//i.test(source)) {
    const sourceUrl = new URL(source);
    return sourceUrl.origin;
  }
  throw new Error(
    `registryBaseUrl is required for relative source URLs: ${source}`,
  );
}

function normalizePosix(value: string): string {
  return value.replaceAll("\\", "/");
}
