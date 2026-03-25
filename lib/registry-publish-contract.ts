import { normalizeRegistryDependenciesInput } from "@/lib/registry-dependency-input";
import { createHash } from "crypto";
import path from "path";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";

export type PublishMode = "create" | "version";

export type PublishContractDiagnostics = {
  /** normalized deps that would be written when present */
  normalizedRegistryDependencies: string[];
  /** whether registryDependencies was explicitly provided by caller */
  registryDependenciesPresent: boolean;
  /** provenance was provided by caller */
  provenancePresent: boolean;
  /** paths dropped due to provenance de-vendoring */
  droppedPaths: string[];
  /** dependency paths whose content hash differs from provenance */
  dirtyDependencyPaths: string[];
};

export type PublishContractResult = {
  /**
   * Presence semantics:
   * - create: always a concrete array (possibly empty)
   * - version: undefined means "do not overwrite existing"
   */
  registryDependenciesToWrite: string[] | undefined;
  previewExport?: string;
  previewProps?: unknown;
  /** When provenance is provided, only these files should be published. */
  filesToWrite?: Record<string, string>;
  diagnostics: PublishContractDiagnostics;
};

export type ProvenancePolicy = "strict" | "split" | "inlineVendor";

type CozyProvenanceFileRoot = { path: string; source: "root" };
type CozyProvenanceFileGenerated = { path: string; source: "generated" };
type CozyProvenanceFileRegistry = {
  path: string;
  source: "registry";
  ref: string;
  originalPath: string;
  contentHash: string;
};

type CozyProvenanceFile =
  | CozyProvenanceFileRoot
  | CozyProvenanceFileGenerated
  | CozyProvenanceFileRegistry;

export type CozyProvenanceManifestV1 = {
  schemaVersion: 1;
  root: { ref: string; version?: string };
  files: CozyProvenanceFile[];
};

function sha256Utf8(content: string): string {
  const hex = createHash("sha256").update(content, "utf8").digest("hex");
  return `sha256:${hex}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isProvenanceFileRoot(v: unknown): v is CozyProvenanceFileRoot {
  return isRecord(v) && v["source"] === "root" && typeof v["path"] === "string";
}

function isProvenanceFileRegistry(
  v: unknown,
): v is CozyProvenanceFileRegistry {
  return (
    isRecord(v) &&
    v["source"] === "registry" &&
    typeof v["path"] === "string" &&
    typeof v["ref"] === "string" &&
    typeof v["contentHash"] === "string"
  );
}

export function normalizePublishContract(params: {
  mode: PublishMode;
  /** raw args/body from REST or MCP */
  input: {
    registryDependencies?: unknown;
    previewProps?: unknown;
    previewExport?: unknown;
    provenance?: unknown;
    provenancePolicy?: unknown;
  };
  /** optional multi-file bundle submitted by caller */
  files?: Record<string, string> | undefined;
}): { ok: true; value: PublishContractResult } | { ok: false; error: string } {
  const registryDependenciesPresent = Object.prototype.hasOwnProperty.call(
    params.input,
    "registryDependencies",
  );
  const normalizedDeps = registryDependenciesPresent
    ? normalizeRegistryDependenciesInput(params.input.registryDependencies)
    : { value: [] as string[] };
  if (normalizedDeps.error) {
    return { ok: false, error: normalizedDeps.error };
  }

  const registryDependenciesToWrite =
    params.mode === "create"
      ? normalizedDeps.value
      : registryDependenciesPresent
        ? normalizedDeps.value
        : undefined;

  const previewExport =
    typeof params.input.previewExport === "string" &&
    params.input.previewExport.trim().length > 0
      ? params.input.previewExport.trim()
      : undefined;

  const provenancePresent = Object.prototype.hasOwnProperty.call(
    params.input,
    "provenance",
  );
  const droppedPaths: string[] = [];
  const dirtyDependencyPaths: string[] = [];

  const policy: ProvenancePolicy =
    params.input.provenancePolicy === "split" ||
    params.input.provenancePolicy === "inlineVendor"
      ? (params.input.provenancePolicy as ProvenancePolicy)
      : "strict";

  let filesToWrite: Record<string, string> | undefined;
  let depsFromProvenance: string[] = [];

  if (provenancePresent && params.input.provenance != null && params.files) {
    const prov = params.input.provenance as Partial<CozyProvenanceManifestV1>;
    const files: unknown[] = Array.isArray(prov.files) ? (prov.files as unknown[]) : [];
    const rootPaths = new Set(
      files
        .filter(isProvenanceFileRoot)
        .map((f) => f.path)
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0),
    );
    const registryFiles = files.filter(
      isProvenanceFileRegistry,
    );

    depsFromProvenance = Array.from(
      new Set(
        registryFiles
          .map((f) => (typeof f.ref === "string" ? f.ref.trim() : ""))
          .filter(Boolean),
      ),
    );

    const next: Record<string, string> = {};
    const allPaths = Object.keys(params.files);

    if (rootPaths.size > 0) {
      const registryByPath = new Map(registryFiles.map((f) => [f.path, f]));
      for (const p of allPaths) {
        if (rootPaths.has(p)) {
          next[p] = params.files[p] as string;
          continue;
        }

        const reg = registryByPath.get(p);
        if (reg && policy !== "inlineVendor") {
          // Replace expanded dependency implementation with a stub that forwards to `_deps/...`.
          const parsed = parseRegistryDependencyRef(reg.ref.trim());
          if (parsed) {
            const depIndex = path.posix.join("_deps", parsed.owner, parsed.name, "index");
            const rel = path.posix.relative(path.posix.dirname(p), depIndex);
            const spec = rel.startsWith(".") ? rel : `./${rel}`;
            next[p] =
              `// auto-generated by cozy registry. do not edit.\nexport * from "${spec}";\n`;
            continue;
          }
        }

        droppedPaths.push(p);
      }
      filesToWrite = next;
    } else {
      // If provenance doesn't specify root paths, don't drop anything.
      filesToWrite = params.files;
    }

    // dirty detection for provenance-marked registry files (only meaningful in strict/split)
    const byPath = new Map(registryFiles.map((f) => [f.path, f]));
    for (const [p, v] of Object.entries(params.files)) {
      const meta = byPath.get(p);
      if (!meta) continue;
      const expected = meta.contentHash;
      const actual = sha256Utf8(v);
      if (expected && expected !== actual) dirtyDependencyPaths.push(p);
    }

    if (dirtyDependencyPaths.length > 0 && policy === "strict") {
      return {
        ok: false,
        error:
          "Provenance strict mode: dependency files were modified. Publish the dependency item(s) instead, or revert changes.\n\nDirty paths:\n" +
          dirtyDependencyPaths.slice(0, 20).map((p) => `- ${p}`).join("\n"),
      };
    }
  }

  const mergedDeps = (() => {
    // If provenance exists, treat derived deps as additive to explicit deps.
    const out = new Set<string>(normalizedDeps.value);
    for (const d of depsFromProvenance) out.add(d);
    return Array.from(out);
  })();

  const effectiveRegistryDependenciesToWrite = (() => {
    if (provenancePresent) {
      // provenance is an explicit signal; treat as present
      return params.mode === "create" ? mergedDeps : mergedDeps;
    }
    return registryDependenciesToWrite;
  })();

  return {
    ok: true,
    value: {
      registryDependenciesToWrite: effectiveRegistryDependenciesToWrite,
      previewProps: params.input.previewProps,
      previewExport,
      filesToWrite,
      diagnostics: {
        normalizedRegistryDependencies: mergedDeps,
        registryDependenciesPresent,
        provenancePresent,
        droppedPaths,
        dirtyDependencyPaths,
      },
    },
  };
}

