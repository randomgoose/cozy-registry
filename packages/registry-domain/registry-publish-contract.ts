import path from "path";
import { inferRegistryDependenciesFromStubScan } from "@cozy/registry-domain/registry-dependency-stub-scan";
import { normalizeRegistryDependenciesInput } from "@cozy/registry-domain/registry-dependency-input";
import { parseRegistryDependencyRef } from "@cozy/registry-domain/registry-graph";
import {
  isPlaceholderContentHash,
  isProvenanceFileRegistry,
  isProvenanceFileRoot,
  normalizeProvenanceFiles,
  sha256Utf8,
  type CozyProvenanceManifestV1,
} from "@cozy/tooling/cozy-provenance";

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
  /** refs inferred from cozy stub patterns (spec §3.5.2) */
  stubInferredRegistryDependencies: string[];
  /** true when stub-inferred refs were merged into the persisted registryDependencies (applyStubInference was true) */
  stubInferenceMergedIntoWrite: boolean;
  /** effective provenance policy */
  policyApplied: ProvenancePolicy | "none";
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
  /** Same as written registryDependencies when a write occurs (create or explicit version update). */
  appliedRegistryDependencies?: string[];
};

export type ProvenancePolicy = "strict" | "split" | "inlineVendor";

function appendStubInferredDeps(params: {
  mode: PublishMode;
  registryDependenciesPresent: boolean;
  values: string[];
  files?: Record<string, string>;
  provenancePresent: boolean;
  /** When false (default), stub scan does not affect persisted registryDependencies. */
  applyStubInference: boolean;
}): string[] {
  if (params.provenancePresent || !params.files) return params.values;
  if (params.mode === "version" && !params.registryDependenciesPresent) {
    return params.values;
  }
  if (!params.applyStubInference) return params.values;
  const inferred = inferRegistryDependenciesFromStubScan(params.files);
  return Array.from(new Set([...params.values, ...inferred]));
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
    /**
     * When strictly `true`, merge Cozy stub-inferred refs into written `registryDependencies`.
     * Default / omitted / false: stub results appear only in diagnostics.stubInferredRegistryDependencies.
     */
    applyStubInference?: unknown;
  };
  /** optional multi-file bundle submitted by caller */
  files?: Record<string, string> | undefined;
  /** When mode is version and registryDependencies is absent: previous stored deps (for provenance merge). */
  previousRegistryDependencies?: string[] | undefined;
}): { ok: true; value: PublishContractResult } | { ok: false; error: string; code?: string } {
  const registryDependenciesPresent = Object.prototype.hasOwnProperty.call(
    params.input,
    "registryDependencies",
  );
  const normalizedDeps = registryDependenciesPresent
    ? normalizeRegistryDependenciesInput(params.input.registryDependencies)
    : { value: [] as string[] };
  if (normalizedDeps.error) {
    return { ok: false, error: normalizedDeps.error, code: "REGDEP_INVALID_FORMAT" };
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

  const applyStubInference = params.input.applyStubInference === true;

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
    const files: unknown[] = normalizeProvenanceFiles(prov.files);
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
      // Always include root files.
      for (const p of allPaths) {
        if (rootPaths.has(p)) {
          next[p] = params.files[p] as string;
          continue;
        }

        const reg = registryByPath.get(p);
        if (reg && policy === "inlineVendor") {
          next[p] = params.files[p] as string;
          continue;
        }
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

      // Also synthesize stub files for provenance-marked registry paths that
      // were not included in the uploaded bundle, so relative imports like
      // `./Button` keep working even when dependency implementations are omitted.
      for (const reg of registryFiles) {
        if (policy === "inlineVendor") continue;
        if (typeof reg.path !== "string" || reg.path.trim().length === 0) continue;
        if (reg.path in next) continue;
        const parsed = parseRegistryDependencyRef(reg.ref.trim());
        if (!parsed) continue;
        const depIndex = path.posix.join("_deps", parsed.owner, parsed.name, "index");
        const rel = path.posix.relative(path.posix.dirname(reg.path), depIndex);
        const spec = rel.startsWith(".") ? rel : `./${rel}`;
        next[reg.path] = `// auto-generated by cozy registry. do not edit.\nexport * from "${spec}";\n`;
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
      if (isPlaceholderContentHash(expected)) {
        continue;
      }
      const actual = sha256Utf8(v);
      if (expected && expected !== actual) dirtyDependencyPaths.push(p);
    }

    if (dirtyDependencyPaths.length > 0 && policy === "strict") {
      return {
        ok: false,
        error:
          "Provenance strict mode: dependency files were modified. Publish the dependency item(s) instead, or revert changes.\n\nDirty paths:\n" +
          dirtyDependencyPaths.slice(0, 20).map((p) => `- ${p}`).join("\n"),
        code: "PROV_DIRTY_DEPENDENCY",
      };
    }

    if (dirtyDependencyPaths.length > 0 && policy === "split") {
      return {
        ok: false,
        error:
          "Provenance split mode is not automated yet: publish updated dependency items first with pinned refs, then publish the root (or use provenancePolicy \"strict\" after reverting local edits, or \"inlineVendor\" to vendor copies).",
        code: "PROV_SPLIT_NOT_IMPLEMENTED",
      };
    }
  }

  const mergedDeps = (() => {
    const base: string[] =
      provenancePresent && params.mode === "version" && !registryDependenciesPresent
        ? (params.previousRegistryDependencies ?? [])
        : normalizedDeps.value;
    const out = new Set<string>(base);
    for (const d of depsFromProvenance) out.add(d);
    return Array.from(out);
  })();

  const stubInferred = params.files
    ? inferRegistryDependenciesFromStubScan(params.files)
    : [];

  const effectiveRegistryDependenciesToWrite = (() => {
    if (provenancePresent) {
      return mergedDeps;
    }
    if (params.mode === "create") {
      return appendStubInferredDeps({
        mode: params.mode,
        registryDependenciesPresent,
        values: normalizedDeps.value,
        files: params.files,
        provenancePresent: false,
        applyStubInference,
      });
    }
    if (registryDependenciesPresent) {
      return appendStubInferredDeps({
        mode: params.mode,
        registryDependenciesPresent,
        values: normalizedDeps.value,
        files: params.files,
        provenancePresent: false,
        applyStubInference,
      });
    }
    return registryDependenciesToWrite;
  })();

  const policyApplied: ProvenancePolicy | "none" = provenancePresent ? policy : "none";

  const appliedRegistryDependencies =
    effectiveRegistryDependenciesToWrite !== undefined
      ? effectiveRegistryDependenciesToWrite
      : undefined;

  const normalizedRegistryDependenciesForDiagnostics =
    effectiveRegistryDependenciesToWrite !== undefined
      ? effectiveRegistryDependenciesToWrite
      : mergedDeps;

  const stubInferenceMergedIntoWrite =
    applyStubInference &&
    stubInferred.length > 0 &&
    Boolean(params.files) &&
    !provenancePresent &&
    (params.mode === "create" || registryDependenciesPresent);

  return {
    ok: true,
    value: {
      registryDependenciesToWrite: effectiveRegistryDependenciesToWrite,
      appliedRegistryDependencies,
      previewProps: params.input.previewProps,
      previewExport,
      filesToWrite,
      diagnostics: {
        normalizedRegistryDependencies: normalizedRegistryDependenciesForDiagnostics,
        registryDependenciesPresent,
        provenancePresent,
        droppedPaths,
        dirtyDependencyPaths,
        stubInferredRegistryDependencies: stubInferred,
        stubInferenceMergedIntoWrite,
        policyApplied,
      },
    },
  };
}
