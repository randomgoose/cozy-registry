import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import {
  getCurrentVersion,
  getRegistryItemByOwnerNameAndVersion,
} from "@/lib/registry";

export type RegistryDependencyHealthStatus =
  | "up-to-date"
  | "outdated"
  | "missing";

export type RegistryDependencyHealthEntry = {
  ref: string;
  status: RegistryDependencyHealthStatus;
  declaredVersion: string | null;
  latestVersion: string | null;
};

/** Simple semver compare for x.y.z style versions (registry v1). */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((x) => parseInt(x, 10));
  const pb = b.split(/[.\-+]/).map((x) => parseInt(x, 10));
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i++) {
    const da = Number.isFinite(pa[i]) ? pa[i]! : 0;
    const db = Number.isFinite(pb[i]) ? pb[i]! : 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

/**
 * Non-blocking health check for declared registry dependency refs.
 * Does not throw; missing items yield status "missing".
 */
export async function computeRegistryDependencyHealth(
  refs: string[],
  requestUserId: string | null,
): Promise<RegistryDependencyHealthEntry[]> {
  const unique = Array.from(new Set(refs.map((r) => r.trim()).filter(Boolean)));
  const out: RegistryDependencyHealthEntry[] = [];

  for (const ref of unique) {
    const parsed = parseRegistryDependencyRef(ref);
    if (!parsed) {
      out.push({
        ref,
        status: "missing",
        declaredVersion: null,
        latestVersion: null,
      });
      continue;
    }

    const item = await getRegistryItemByOwnerNameAndVersion(
      parsed.owner,
      parsed.name,
      null,
      requestUserId,
    );

    if (!item) {
      out.push({
        ref,
        status: "missing",
        declaredVersion: parsed.version,
        latestVersion: null,
      });
      continue;
    }

    const latest = getCurrentVersion(item);

    if (!parsed.version) {
      out.push({
        ref,
        status: "up-to-date",
        declaredVersion: null,
        latestVersion: latest,
      });
      continue;
    }

    const cmp = compareSemver(parsed.version, latest);
    if (cmp >= 0) {
      out.push({
        ref,
        status: "up-to-date",
        declaredVersion: parsed.version,
        latestVersion: latest,
      });
    } else {
      out.push({
        ref,
        status: "outdated",
        declaredVersion: parsed.version,
        latestVersion: latest,
      });
    }
  }

  out.sort((a, b) => a.ref.localeCompare(b.ref));
  return out;
}

export function formatDependencyHealthForMcp(
  entries: RegistryDependencyHealthEntry[],
): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e) => {
    const latest = e.latestVersion ?? "?";
    switch (e.status) {
      case "missing":
        return `- ${e.ref}: missing (not found or no access)`;
      case "outdated":
        return `- ${e.ref}: outdated (declared ${e.declaredVersion ?? "?"}, latest ${latest})`;
      default:
        return `- ${e.ref}: up-to-date (latest ${latest})`;
    }
  });
  return (
    `\n\nDependency health (informational, non-blocking):\n${lines.join("\n")}\n\n` +
    `JSON:\n${JSON.stringify({ dependencyHealth: entries }, null, 2)}`
  );
}
