export type DependencyTier =
  | "runtime-provided"
  | "trusted-built-in"
  | "soft-allowed"
  | "rejected";

export type PreviewCapability =
  | "runtime-only"
  | "prebundle-supported"
  | "compatible-artifact-supported"
  | "blocked";

export type ProviderMode =
  | "runtime-provided"
  | "managed-provider"
  | "compatible-external"
  | "blocked";

export type VersionPolicyStatus =
  | "accepted"
  | "unknown"
  | "rejected";

export type DependencyDecision = {
  importSpecifier?: string;
  packageName: string;
  requestedVersion: string | null;
  tier: DependencyTier;
  providerMode?: ProviderMode;
  previewCapability: PreviewCapability;
  versionPolicyStatus: VersionPolicyStatus;
  message: string;
  reasonCode?: string;
};

export function getDependencyDisplayName(
  decision: Pick<DependencyDecision, "packageName" | "importSpecifier">,
) {
  return decision.importSpecifier?.trim() || decision.packageName;
}
