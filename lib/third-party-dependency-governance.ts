import type { DeclaredThirdPartyDependency } from "@/lib/third-party-dependency-input";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import {
  BLOCKED_THIRD_PARTY_DEPENDENCIES,
  NODE_BUILTIN_DEPENDENCIES,
  RUNTIME_PROVIDED_DEPENDENCIES,
  TRUSTED_BUILT_IN_DEPENDENCIES,
} from "@/lib/third-party-dependency-catalog";

export type DependencyTier =
  | "runtime-provided"
  | "trusted-built-in"
  | "soft-allowed"
  | "rejected";

export type PreviewCapability =
  | "runtime-only"
  | "prebundle-supported"
  | "blocked";

export type VersionPolicyStatus =
  | "accepted"
  | "unknown"
  | "rejected";

export type DependencyDecision = {
  packageName: string;
  requestedVersion: string | null;
  tier: DependencyTier;
  previewCapability: PreviewCapability;
  versionPolicyStatus: VersionPolicyStatus;
  message: string;
  reasonCode?: string;
};

export type DependencySnapshot = {
  version: 1;
  catalogVersion: 1;
  declaredDependencies: DeclaredThirdPartyDependency[];
  dependencyDecisions: DependencyDecision[];
};

const RUNTIME_PROVIDED: Set<string> = new Set(RUNTIME_PROVIDED_DEPENDENCIES);
const TRUSTED_BUILT_INS: Set<string> = new Set(TRUSTED_BUILT_IN_DEPENDENCIES);
const BLOCKED_PACKAGES: Set<string> = new Set(BLOCKED_THIRD_PARTY_DEPENDENCIES);
const NODE_BUILTINS: Set<string> = new Set(NODE_BUILTIN_DEPENDENCIES);
const DEPENDENCY_SNAPSHOT_VERSION = 1 as const;
const DEPENDENCY_CATALOG_VERSION = 1 as const;

export function toRegistryDependencySpecifier(ref: string): string | null {
  const parsed = parseRegistryDependencyRef(ref);
  if (!parsed) return null;
  return parsed.project
    ? `@${parsed.owner}/${parsed.project}/${parsed.name}`
    : `@${parsed.owner}/${parsed.name}`;
}

export function excludeExplicitRegistryDependencies(
  discovered: string[],
  registryDependencies?: string[] | null,
): string[] {
  const explicitRegistrySpecifiers = new Set(
    (registryDependencies ?? [])
      .map((ref) => toRegistryDependencySpecifier(ref))
      .filter((ref): ref is string => !!ref),
  );

  if (explicitRegistrySpecifiers.size === 0) {
    return discovered;
  }

  return discovered.filter((specifier) => !explicitRegistrySpecifiers.has(specifier));
}

export function evaluateThirdPartyDependencies(input: {
  discovered: string[];
  declared?: DeclaredThirdPartyDependency[];
}): DependencyDecision[] {
  const declaredByName = new Map(
    (input.declared ?? []).map((entry) => [entry.name, entry]),
  );

  return Array.from(
    new Set(input.discovered.map((dep) => dep.trim()).filter(Boolean)),
  )
    .sort()
    .map((packageName) => evaluateDependency(packageName, declaredByName.get(packageName)));
}

export function buildDependencySnapshot(input: {
  declared?: DeclaredThirdPartyDependency[];
  decisions?: DependencyDecision[];
}): DependencySnapshot {
  return {
    version: DEPENDENCY_SNAPSHOT_VERSION,
    catalogVersion: DEPENDENCY_CATALOG_VERSION,
    declaredDependencies: normalizeDeclaredDependencies(input.declared ?? []),
    dependencyDecisions: normalizeDependencyDecisions(input.decisions ?? []),
  };
}

export function readDependencySnapshotFromMeta(
  meta: unknown,
): DependencySnapshot | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).dependencySnapshot;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const rec = raw as Record<string, unknown>;
  if (rec.version !== DEPENDENCY_SNAPSHOT_VERSION) return null;

  return {
    version: DEPENDENCY_SNAPSHOT_VERSION,
    catalogVersion:
      rec.catalogVersion === DEPENDENCY_CATALOG_VERSION
        ? DEPENDENCY_CATALOG_VERSION
        : DEPENDENCY_CATALOG_VERSION,
    declaredDependencies: normalizeDeclaredDependencies(
      Array.isArray(rec.declaredDependencies) ? rec.declaredDependencies : [],
    ),
    dependencyDecisions: normalizeDependencyDecisions(
      Array.isArray(rec.dependencyDecisions) ? rec.dependencyDecisions : [],
    ),
  };
}

export function readDeclaredThirdPartyDependenciesFromMeta(
  meta: unknown,
): DeclaredThirdPartyDependency[] {
  const snapshot = readDependencySnapshotFromMeta(meta);
  if (snapshot) return snapshot.declaredDependencies;
  if (!meta || typeof meta !== "object") return [];
  return normalizeDeclaredDependencies((meta as Record<string, unknown>).declaredDependencies);
}

export function readDependencyDecisionsFromMeta(
  meta: unknown,
): DependencyDecision[] {
  const snapshot = readDependencySnapshotFromMeta(meta);
  if (snapshot) return snapshot.dependencyDecisions;
  if (!meta || typeof meta !== "object") return [];
  return normalizeDependencyDecisions((meta as Record<string, unknown>).dependencyDecisions);
}

export function getRuntimePreviewDependencies(decisions: DependencyDecision[]) {
  return decisions
    .filter((decision) => decision.previewCapability !== "blocked")
    .map((decision) => decision.packageName)
    .sort();
}

export function getPrebundleDependencies(decisions: DependencyDecision[]) {
  return decisions
    .filter((decision) => decision.previewCapability === "prebundle-supported")
    .map((decision) => decision.packageName)
    .sort();
}

export function hasRuntimeOnlyDependencies(decisions: DependencyDecision[]) {
  return decisions.some((decision) => decision.previewCapability === "runtime-only");
}

export function getRejectedDependencyDecisions(decisions: DependencyDecision[]) {
  return decisions.filter((decision) => decision.previewCapability === "blocked");
}

function evaluateDependency(
  packageName: string,
  declared?: DeclaredThirdPartyDependency,
): DependencyDecision {
  const requestedVersion = declared?.version ?? null;

  if (RUNTIME_PROVIDED.has(packageName)) {
    return {
      packageName,
      requestedVersion,
      tier: "runtime-provided",
      previewCapability: "runtime-only",
      versionPolicyStatus: "accepted",
      message: "Provided by the platform runtime; prebundle is not needed.",
    };
  }

  if (isRejectedPackage(packageName)) {
    return {
      packageName,
      requestedVersion,
      tier: "rejected",
      previewCapability: "blocked",
      versionPolicyStatus: "rejected",
      message:
        "This dependency is outside the browser preview boundary and is rejected at publish time.",
      reasonCode: "DEPENDENCY_BLOCKED",
    };
  }

  if (TRUSTED_BUILT_INS.has(packageName)) {
    if (requestedVersion) {
      return {
        packageName,
        requestedVersion,
        tier: "trusted-built-in",
        previewCapability: "prebundle-supported",
        versionPolicyStatus: "accepted",
        message: "Allowed and eligible for preview artifact prebundle.",
      };
    }
    return {
      packageName,
      requestedVersion: null,
      tier: "trusted-built-in",
      previewCapability: "runtime-only",
      versionPolicyStatus: "unknown",
      message:
        "Known package without an explicit publish-time version; downgraded to runtime-only compatibility mode.",
      reasonCode: "VERSION_UNKNOWN_RUNTIME_ONLY",
    };
  }

  return {
    packageName,
    requestedVersion,
    tier: "soft-allowed",
    previewCapability: "runtime-only",
    versionPolicyStatus: requestedVersion ? "accepted" : "unknown",
    message: requestedVersion
      ? "Published in compatibility mode; artifact prebundle is disabled by policy."
      : "Published in compatibility mode without an explicit version; artifact prebundle is disabled.",
    reasonCode: requestedVersion
      ? "SOFT_ALLOWED_RUNTIME_ONLY"
      : "VERSION_UNKNOWN_RUNTIME_ONLY",
  };
}

function isRejectedPackage(packageName: string) {
  if (!packageName) return true;
  if (packageName.startsWith("node:")) return true;
  if (NODE_BUILTINS.has(packageName)) return true;
  if (BLOCKED_PACKAGES.has(packageName)) return true;
  return false;
}

function normalizeDeclaredDependencies(
  raw: unknown,
): DeclaredThirdPartyDependency[] {
  if (!Array.isArray(raw)) return [];

  const out: DeclaredThirdPartyDependency[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) continue;
    const version =
      typeof rec.version === "string" && rec.version.trim().length > 0
        ? rec.version.trim()
        : null;
    out.push({ name, version });
  }
  return out;
}

function normalizeDependencyDecisions(raw: unknown): DependencyDecision[] {
  if (!Array.isArray(raw)) return [];

  const out: DependencyDecision[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const packageName =
      typeof rec.packageName === "string" ? rec.packageName.trim() : "";
    const tier = rec.tier;
    const previewCapability = rec.previewCapability;
    const versionPolicyStatus = rec.versionPolicyStatus;
    if (!packageName) continue;
    if (
      tier !== "runtime-provided" &&
      tier !== "trusted-built-in" &&
      tier !== "soft-allowed" &&
      tier !== "rejected"
    ) {
      continue;
    }
    if (
      previewCapability !== "runtime-only" &&
      previewCapability !== "prebundle-supported" &&
      previewCapability !== "blocked"
    ) {
      continue;
    }
    if (
      versionPolicyStatus !== "accepted" &&
      versionPolicyStatus !== "unknown" &&
      versionPolicyStatus !== "rejected"
    ) {
      continue;
    }
    out.push({
      packageName,
      requestedVersion:
        typeof rec.requestedVersion === "string" && rec.requestedVersion.trim().length > 0
          ? rec.requestedVersion.trim()
          : null,
      tier,
      previewCapability,
      versionPolicyStatus,
      message: typeof rec.message === "string" ? rec.message : "",
      reasonCode: typeof rec.reasonCode === "string" ? rec.reasonCode : undefined,
    });
  }
  return out;
}
