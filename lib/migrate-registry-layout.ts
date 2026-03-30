import fs from "node:fs/promises";
import path from "node:path";
import { REGISTRY_INSTALL_ROOT } from "@/lib/registry-install-layout";
import {
  readLockfile,
  validateProjectRoot,
  writeLockfile,
  type CozyLockfile,
} from "@/lib/install-protocol";

/** Pre–flat-layout default install root. */
export const LEGACY_REGISTRY_INSTALL_ROOT = "src/registry";

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|css)$/i;

export type MigrateRegistryLayoutOptions = {
  dryRun?: boolean;
  /** If true, overwrite existing files under the new install root. */
  force?: boolean;
};

export type MigrateRegistryLayoutReport = {
  oldRoot: string;
  newRoot: string;
  copiedDepPackages: string[];
  copiedRootPackages: string[];
  rewrittenSourceFiles: string[];
  lockfileUpdated: boolean;
  provenanceFilesUpdated: string[];
  removedOldRoot: boolean;
  warnings: string[];
};

function normalizePosix(p: string): string {
  return p.replaceAll("\\", "/");
}

/**
 * Map a project-relative path from legacy layout to the current default layout.
 * Non-legacy paths are returned unchanged.
 */
export function migrateInstalledFilePath(projectRelative: string): string {
  const n = normalizePosix(projectRelative);
  const prefix = `${LEGACY_REGISTRY_INSTALL_ROOT}/`;
  if (!n.startsWith(prefix)) return projectRelative;
  const rest = n.slice(prefix.length);
  const parts = rest.split("/");
  if (parts.length >= 5 && parts[2] === "_deps") {
    const depOwner = parts[3]!;
    const depName = parts[4]!;
    const tail = parts.slice(5).join("/");
    return tail
      ? `${REGISTRY_INSTALL_ROOT}/${depOwner}/${depName}/${tail}`
      : `${REGISTRY_INSTALL_ROOT}/${depOwner}/${depName}`;
  }
  return `${REGISTRY_INSTALL_ROOT}/${rest}`;
}

function specifierToNewRelative(
  importerProjectRelative: string,
  specifier: string,
): string | null {
  const importer = normalizePosix(importerProjectRelative);
  const prefix = `${REGISTRY_INSTALL_ROOT}/`;
  if (!importer.startsWith(prefix)) return null;
  if (!specifier.includes("_deps")) return null;

  const parts = importer.split("/");
  if (parts.length < 6) return null;

  const owner = parts[4];
  const name = parts[5];
  if (!owner || !name) return null;

  const oldImporterDir = `${LEGACY_REGISTRY_INSTALL_ROOT}/${owner}/${name}`;
  const resolvedOld = path.posix.normalize(
    path.posix.join(oldImporterDir, specifier),
  );

  const m = resolvedOld.match(
    /^src\/registry\/[^/]+\/[^/]+\/_deps\/([^/]+)\/([^/]+)(\/.*)?$/,
  );
  if (!m) return null;

  const depOwner = m[1]!;
  const depName = m[2]!;
  const restWithSlash = m[3];
  const rest = restWithSlash ? restWithSlash.slice(1) : "";

  let target = path.posix.join(REGISTRY_INSTALL_ROOT, depOwner, depName, rest);
  target = target.replace(/\.(tsx?|jsx?|css)$/i, "");

  const fromDir = path.posix.dirname(importer);
  let rel = path.posix.relative(fromDir, target);
  if (!rel || rel === ".") rel = ".";
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

/**
 * Rewrite `…/_deps/owner/name/…` import specifiers after files moved under
 * {@link REGISTRY_INSTALL_ROOT}.
 */
export function rewriteLegacyDepsImports(
  content: string,
  importerProjectRelative: string,
): string {
  const patterns = [
    /(from\s*["'])([^"']+)(["'])/g,
    /(import\s*\(\s*["'])([^"']+)(["']\s*\))/g,
    /(require\s*\(\s*["'])([^"']+)(["']\s*\))/g,
  ];

  let next = content;
  for (const pattern of patterns) {
    next = next.replace(pattern, (match, prefix, specifier, suffix) => {
      const replacement = specifierToNewRelative(
        importerProjectRelative,
        specifier,
      );
      if (!replacement || replacement === specifier) return match;
      return `${prefix}${replacement}${suffix}`;
    });
  }
  return next;
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

type DiscoveredRoot = { owner: string; name: string; absPath: string };

async function discoverLegacyRoots(projectRoot: string): Promise<DiscoveredRoot[]> {
  const base = path.join(projectRoot, LEGACY_REGISTRY_INSTALL_ROOT);
  const out: DiscoveredRoot[] = [];
  let owners: import("node:fs").Dirent[];
  try {
    owners = await fs.readdir(base, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  for (const o of owners) {
    if (!o.isDirectory()) continue;
    const op = path.join(base, o.name);
    const subs = await fs.readdir(op, { withFileTypes: true });
    for (const n of subs) {
      if (!n.isDirectory()) continue;
      out.push({
        owner: o.name,
        name: n.name,
        absPath: path.join(op, n.name),
      });
    }
  }
  return out;
}

async function listFilesRecursive(
  srcRoot: string,
  dir: string,
  acc: string[],
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await listFilesRecursive(srcRoot, abs, acc);
    } else if (e.isFile()) {
      acc.push(normalizePosix(path.relative(srcRoot, abs)));
    }
  }
}

async function copyTree(
  srcDir: string,
  destDir: string,
  options: { force: boolean; dryRun: boolean },
  warnings: string[],
): Promise<void> {
  const relFiles: string[] = [];
  await listFilesRecursive(srcDir, srcDir, relFiles);

  for (const rel of relFiles) {
    const from = path.join(srcDir, rel);
    const to = path.join(destDir, rel);
    if (!options.force && (await pathExists(to))) {
      const a = await fs.readFile(from, "utf8");
      const b = await fs.readFile(to, "utf8");
      if (a !== b) {
        warnings.push(
          `Skip conflicting file (use --force to overwrite): ${normalizePosix(path.relative(process.cwd(), to))}`,
        );
        continue;
      }
    }
    if (!options.dryRun) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
  }
}

async function rewriteSourcesUnderDir(params: {
  projectRoot: string;
  dirAbs: string;
  dryRun: boolean;
}): Promise<string[]> {
  const rewritten: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile() && CODE_EXT.test(e.name)) {
        const projectRel = normalizePosix(path.relative(params.projectRoot, abs));
        const content = await fs.readFile(abs, "utf8");
        const next = rewriteLegacyDepsImports(content, projectRel);
        if (next !== content) {
          rewritten.push(projectRel);
          if (!params.dryRun) {
            await fs.writeFile(abs, next, "utf8");
          }
        }
      }
    }
  };

  if (await pathExists(params.dirAbs)) {
    await walk(params.dirAbs);
  }
  return rewritten;
}

/** Preview which files would gain new `_deps` imports (dry-run; reads legacy tree only). */
async function listRewritesFromLegacyTree(projectRoot: string): Promise<string[]> {
  const changed: string[] = [];
  const base = path.join(projectRoot, LEGACY_REGISTRY_INSTALL_ROOT);
  if (!(await pathExists(base))) return changed;

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile() && CODE_EXT.test(e.name)) {
        const oldRel = normalizePosix(path.relative(projectRoot, abs));
        const newRel = migrateInstalledFilePath(oldRel);
        const content = await fs.readFile(abs, "utf8");
        if (rewriteLegacyDepsImports(content, newRel) !== content) {
          changed.push(newRel);
        }
      }
    }
  };

  await walk(base);
  return changed;
}

async function listProvenanceUpdatesFromLegacyTree(
  projectRoot: string,
): Promise<string[]> {
  const updated: string[] = [];
  const base = path.join(projectRoot, LEGACY_REGISTRY_INSTALL_ROOT);
  if (!(await pathExists(base))) return updated;

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile() && e.name === "cozy.provenance.json") {
        const raw = await fs.readFile(abs, "utf8");
        let manifest: unknown;
        try {
          manifest = JSON.parse(raw);
        } catch {
          continue;
        }
        if (
          !manifest ||
          typeof manifest !== "object" ||
          !Array.isArray((manifest as { files?: unknown }).files)
        ) {
          continue;
        }
        const m = manifest as { files: Array<{ path?: string }> };
        let changed = false;
        for (const f of m.files) {
          if (typeof f.path !== "string") continue;
          if (migrateInstalledFilePath(f.path) !== f.path) {
            changed = true;
            break;
          }
        }
        if (changed) {
          updated.push(
            migrateInstalledFilePath(
              normalizePosix(path.relative(projectRoot, abs)),
            ),
          );
        }
      }
    }
  };

  await walk(base);
  return updated;
}

async function updateProvenanceFiles(params: {
  projectRoot: string;
  dryRun: boolean;
}): Promise<string[]> {
  const updated: string[] = [];
  const newBase = path.join(params.projectRoot, REGISTRY_INSTALL_ROOT);
  if (!(await pathExists(newBase))) return updated;

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile() && e.name === "cozy.provenance.json") {
        const raw = await fs.readFile(abs, "utf8");
        let manifest: unknown;
        try {
          manifest = JSON.parse(raw);
        } catch {
          continue;
        }
        if (
          !manifest ||
          typeof manifest !== "object" ||
          !Array.isArray((manifest as { files?: unknown }).files)
        ) {
          continue;
        }
        const m = manifest as { files: Array<{ path?: string }> };
        let changed = false;
        for (const f of m.files) {
          if (typeof f.path !== "string") continue;
          const next = migrateInstalledFilePath(f.path);
          if (next !== f.path) {
            f.path = next;
            changed = true;
          }
        }
        if (changed) {
          updated.push(normalizePosix(path.relative(params.projectRoot, abs)));
          if (!params.dryRun) {
            await fs.writeFile(abs, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
          }
        }
      }
    }
  };

  await walk(newBase);
  return updated;
}

function migrateLockfile(lock: CozyLockfile): CozyLockfile {
  const items: CozyLockfile["items"] = { ...lock.items };
  for (const coord of Object.keys(items)) {
    const item = items[coord as keyof typeof items];
    items[coord as keyof typeof items] = {
      ...item,
      installedFiles: item.installedFiles.map((p) => migrateInstalledFilePath(p)),
    };
  }
  return { version: 1, items };
}

/**
 * Copy legacy `src/registry/...` installs into `src/components/registry/...`,
 * hoist nested `_deps` trees into sibling `{owner}/{name}` packages, rewrite
 * `_deps` imports, refresh lockfile paths and provenance `path` fields, then
 * remove `src/registry`.
 */
export async function migrateProjectRegistryLayout(
  projectRoot: string,
  options: MigrateRegistryLayoutOptions = {},
): Promise<MigrateRegistryLayoutReport> {
  const validated = validateProjectRoot(path.resolve(projectRoot));
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const warnings: string[] = [];

  const oldBaseAbs = path.join(validated, LEGACY_REGISTRY_INSTALL_ROOT);
  const newBaseAbs = path.join(validated, REGISTRY_INSTALL_ROOT);

  const report: MigrateRegistryLayoutReport = {
    oldRoot: LEGACY_REGISTRY_INSTALL_ROOT,
    newRoot: REGISTRY_INSTALL_ROOT,
    copiedDepPackages: [],
    copiedRootPackages: [],
    rewrittenSourceFiles: [],
    lockfileUpdated: false,
    provenanceFilesUpdated: [],
    removedOldRoot: false,
    warnings,
  };

  const roots = await discoverLegacyRoots(validated);
  if (roots.length === 0) {
    return report;
  }

  const depTargets = new Map<string, { abs: string; dest: string }>();

  for (const root of roots) {
    const depsRoot = path.join(root.absPath, "_deps");
    if (!(await pathExists(depsRoot))) continue;
    const depOwners = await fs.readdir(depsRoot, { withFileTypes: true });
    for (const dO of depOwners) {
      if (!dO.isDirectory()) continue;
      const op = path.join(depsRoot, dO.name);
      const depNames = await fs.readdir(op, { withFileTypes: true });
      for (const dN of depNames) {
        if (!dN.isDirectory()) continue;
        const key = `${dO.name}/${dN.name}`;
        const srcAbs = path.join(op, dN.name);
        const destAbs = path.join(newBaseAbs, dO.name, dN.name);
        const existing = depTargets.get(key);
        if (existing && existing.abs !== srcAbs) {
          warnings.push(
            `Duplicate _deps for ${key}: keeping first (${path.relative(validated, existing.abs)}), also saw ${path.relative(validated, srcAbs)}`,
          );
          continue;
        }
        depTargets.set(key, { abs: srcAbs, dest: destAbs });
      }
    }
  }

  for (const [, { abs, dest }] of depTargets) {
    const label = normalizePosix(path.relative(validated, dest));
    report.copiedDepPackages.push(label);
    await copyTree(abs, dest, { force, dryRun }, warnings);
  }

  for (const root of roots) {
    const destRoot = path.join(newBaseAbs, root.owner, root.name);
    report.copiedRootPackages.push(
      normalizePosix(path.relative(validated, destRoot)),
    );
    const entries = await fs.readdir(root.absPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "_deps") continue;
      const from = path.join(root.absPath, e.name);
      const to = path.join(destRoot, e.name);
      if (e.isDirectory()) {
        await copyTree(from, to, { force, dryRun }, warnings);
      } else {
        if (!force && (await pathExists(to))) {
          const a = await fs.readFile(from, "utf8");
          const b = await fs.readFile(to, "utf8");
          if (a !== b) {
            warnings.push(
              `Skip conflicting file (use --force): ${normalizePosix(path.relative(validated, to))}`,
            );
            continue;
          }
        }
        if (!dryRun) {
          await fs.mkdir(path.dirname(to), { recursive: true });
          await fs.copyFile(from, to);
        }
      }
    }
  }

  report.rewrittenSourceFiles = dryRun
    ? await listRewritesFromLegacyTree(validated)
    : await rewriteSourcesUnderDir({
        projectRoot: validated,
        dirAbs: newBaseAbs,
        dryRun,
      });

  report.provenanceFilesUpdated = dryRun
    ? await listProvenanceUpdatesFromLegacyTree(validated)
    : await updateProvenanceFiles({
        projectRoot: validated,
        dryRun,
      });

  const lockBefore = await readLockfile(validated);
  const hasLegacyPaths = Object.values(lockBefore.items).some((item) =>
    item.installedFiles.some((p) =>
      normalizePosix(p).startsWith(`${LEGACY_REGISTRY_INSTALL_ROOT}/`),
    ),
  );
  if (hasLegacyPaths) {
    const nextLock = migrateLockfile(lockBefore);
    if (!dryRun) {
      await writeLockfile(validated, nextLock);
    }
    report.lockfileUpdated = true;
  }

  if (!dryRun && (await pathExists(oldBaseAbs))) {
    await fs.rm(oldBaseAbs, { recursive: true, force: true });
    report.removedOldRoot = true;
  }

  return report;
}

/** Load as `tsx` or `node` entry (CLI). */
export async function runMigrateRegistryLayoutCli(argv: string[]): Promise<void> {
  const args = [...argv];
  let dryRun = false;
  let force = false;
  let projectRoot = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--force") force = true;
    else if (a === "--project-root" && args[i + 1]) {
      projectRoot = path.resolve(args[++i]!);
    } else if (a === "--help" || a === "-h") {
      printHelp();
      return;
    }
  }

  const report = await migrateProjectRegistryLayout(projectRoot, {
    dryRun,
    force,
  });

  const lines: string[] = [];
  lines.push(
    `Migrate Cozy registry layout: ${report.oldRoot} → ${report.newRoot}`,
  );
  if (
    report.copiedDepPackages.length === 0 &&
    report.copiedRootPackages.length === 0
  ) {
    lines.push("Nothing to do (no legacy registry installs found).");
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  lines.push(`Hoisted dependency packages: ${report.copiedDepPackages.length}`);
  for (const p of report.copiedDepPackages) lines.push(`  - ${p}`);
  lines.push(`Root packages: ${report.copiedRootPackages.length}`);
  for (const p of report.copiedRootPackages) lines.push(`  - ${p}`);
  lines.push(`Rewritten source files: ${report.rewrittenSourceFiles.length}`);
  lines.push(`Updated provenance files: ${report.provenanceFilesUpdated.length}`);
  lines.push(`Lockfile updated: ${report.lockfileUpdated}`);
  lines.push(`Removed legacy tree: ${report.removedOldRoot}`);
  if (dryRun) lines.push("(dry-run: no files were written or deleted)");
  if (report.warnings.length) {
    lines.push("Warnings:");
    for (const w of report.warnings) lines.push(`  - ${w}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function printHelp(): void {
  process.stdout.write(`Usage: tsx bin/migrate-registry-layout.ts [options]

Migrates pre–flat-layout installs:
  ${LEGACY_REGISTRY_INSTALL_ROOT}/{owner}/{name}/…
  + _deps/{depOwner}/{depName}/…
to:
  ${REGISTRY_INSTALL_ROOT}/{owner}/{name}/…

Options:
  --dry-run          Print the plan without writing or deleting
  --force            Overwrite conflicting files under the new root
  --project-root DIR Absolute project root (default: cwd)
  -h, --help         Show this help

Also updates cozy-registry.lock.json paths and cozy.provenance.json file paths when present.
`);
}
