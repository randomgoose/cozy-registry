import path from "path";
import { inferRegistryDependenciesFromStubScan } from "@cozy/registry-domain/registry-dependency-stub-scan";
import { parseRegistryDependencyRef } from "@cozy/registry-domain/registry-graph";
import {
  extractDependencies,
  isCodeFile,
  isRelativeImport,
  resolveRelativeImport,
} from "@cozy/tooling/validate-tsx";

export type DependencySuggestionConfidence = "high" | "medium" | "low";

export type DependencySuggestion = {
  name: string;
  registryItem: string;
  latestVersion: string;
  confidence: DependencySuggestionConfidence;
  reasons: string[];
};

export type RegistryCatalogEntry = {
  ownerLabel: string;
  name: string;
  title: string;
  currentVersion: string;
};

function normalizePosix(p: string): string {
  return p.replaceAll("\\", "/");
}

/** e.g. Button.tsx -> button, my-button -> my-button */
function fileStemToRegistryName(stem: string): string {
  const s = stem.replace(/\.(tsx?|jsx?)$/i, "");
  if (s.includes("-")) return s.toLowerCase();
  if (/^[A-Z]/.test(s)) {
    return s
      .replace(/^[A-Z]/, (c) => c.toLowerCase())
      .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  }
  return s.toLowerCase();
}

function refForCatalogEntry(e: RegistryCatalogEntry): string {
  return `@${e.ownerLabel}/${e.name}`;
}

/**
 * Read-only: suggest registry refs that may correspond to imports in a bundle,
 * matched against a catalog the caller supplies (e.g. from list_components).
 * Does not read the database.
 */
export function suggestRegistryDependenciesFromFiles(
  files: Record<string, string>,
  catalog: RegistryCatalogEntry[],
): DependencySuggestion[] {
  const byName = new Map<string, RegistryCatalogEntry[]>();
  for (const e of catalog) {
    const list = byName.get(e.name) ?? [];
    list.push(e);
    byName.set(e.name, list);
  }

  const keySeen = new Set<string>();
  const out: DependencySuggestion[] = [];

  const push = (s: DependencySuggestion) => {
    const k = `${s.registryItem}`;
    if (keySeen.has(k)) return;
    keySeen.add(k);
    out.push(s);
  };

  // Stub paths (cozy-generated re-exports)
  for (const ref of inferRegistryDependenciesFromStubScan(files)) {
    const parsed = parseRegistryDependencyRef(ref);
    if (!parsed) continue;
    const match = catalog.find(
      (c) => c.ownerLabel === parsed.owner && c.name === parsed.name,
    );
    if (match) {
      push({
        name: parsed.name,
        registryItem: refForCatalogEntry(match),
        latestVersion: match.currentVersion,
        confidence: "high",
        reasons: [
          "Detected cozy stub re-export path (_deps/...) in bundle (registry-dependency-management-spec §3.5.2).",
        ],
      });
    } else {
      push({
        name: parsed.name,
        registryItem: `@${parsed.owner}/${parsed.name}`,
        latestVersion: "unknown",
        confidence: "medium",
        reasons: [
          "Stub pattern present but item not in the provided catalog (may be private, outside scope, or typo).",
        ],
      });
    }
  }

  for (const [filePathRaw, content] of Object.entries(files)) {
    const filePath = normalizePosix(filePathRaw);
    if (!isCodeFile(filePath) || typeof content !== "string") continue;

    for (const spec of extractDependencies(content)) {
      if (isRelativeImport(spec)) {
        const candidates = resolveRelativeImport(filePath, spec);
        const keys = new Set(Object.keys(files).map(normalizePosix));
        const hit = candidates.find((c) => keys.has(c));
        if (!hit) continue;
        const stem = path.posix.basename(hit, path.posix.extname(hit));
        const registryName = fileStemToRegistryName(stem);
        const matches = byName.get(registryName) ?? [];
        if (matches.length === 1) {
          const m = matches[0];
          push({
            name: registryName,
            registryItem: refForCatalogEntry(m),
            latestVersion: m.currentVersion,
            confidence: "high",
            reasons: [
              `Relative import "${spec}" resolves to "${hit}"; matched registry item by name "${registryName}".`,
            ],
          });
        } else if (matches.length > 1) {
          for (const m of matches) {
            push({
              name: registryName,
              registryItem: refForCatalogEntry(m),
              latestVersion: m.currentVersion,
              confidence: "low",
              reasons: [
                `Relative import "${spec}" resolves to "${hit}"; multiple registry items share name "${registryName}" — confirm owner.`,
              ],
            });
          }
        }
        continue;
      }

      const parsed = parseRegistryDependencyRef(spec);
      if (!parsed) continue;

      const matches = catalog.filter(
        (c) => c.ownerLabel === parsed.owner && c.name === parsed.name,
      );
      if (matches.length === 1) {
        const m = matches[0];
        push({
          name: parsed.name,
          registryItem: refForCatalogEntry(m),
          latestVersion: m.currentVersion,
          confidence: "high",
          reasons: [
            `Import "${spec}" matches catalog entry @${m.ownerLabel}/${m.name}.`,
          ],
        });
      } else if (matches.length === 0) {
        push({
          name: parsed.name,
          registryItem: `@${parsed.owner}/${parsed.name}`,
          latestVersion: "unknown",
          confidence: "low",
          reasons: [
            `Import "${spec}" looks like a registry-style ref but no matching item in the provided catalog (may be npm scope, private item, or outside list scope).`,
          ],
        });
      }
    }
  }

  out.sort((a, b) => a.registryItem.localeCompare(b.registryItem));
  return out;
}

/**
 * Map DB rows from getRegistryItemsScoped to catalog entries for suggestions.
 */
export function toRegistryCatalogEntries(
  items: Array<{
    ownerHandle?: string | null;
    userId?: string | null;
    name: string;
    title: string;
    currentVersion?: string | null;
  }>,
): RegistryCatalogEntry[] {
  return items.map((i) => ({
    ownerLabel: (i.ownerHandle ?? i.userId ?? "legacy").trim() || "legacy",
    name: i.name,
    title: i.title,
    currentVersion: i.currentVersion?.trim() || "0.0.0",
  }));
}
