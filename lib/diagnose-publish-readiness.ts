import {
  validateTsx,
  extractDependencies,
  findMissingRelativeImports,
  isRelativeImport,
  validateComponentBundle,
} from "@/lib/validate-tsx";
import { normalizePublishContract } from "@/lib/registry-publish-contract";
import { runRegistryPreviewSmokeTest } from "@/lib/registry-preview-smoke";
import {
  publishFailureCategoryForCode,
  type PublishFailureCategory,
} from "@/lib/registry-publish-failure";
import { normalizePublishThemeArgs } from "@/lib/theme-publish-args";
import {
  REGISTRY_THEME_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { findAppSpecificUsage } from "@/lib/registry-app-usage-scan";

export type DiagnosePublishReadinessResult =
  | {
      ok: true;
      summary: string;
      runPreviewSmoke: boolean;
      previewAdvice?: {
        detectedExports: string[];
        hasDefaultExport: boolean;
        recommendedPreviewExport: string | null;
        note: string | null;
      };
      publishDiagnostics?: {
        droppedPaths: string[];
        dirtyDependencyPaths: string[];
        stubInferredRegistryDependencies: string[];
        stubInferenceMergedIntoWrite: boolean;
        policyApplied: string | null;
      };
    }
  | {
      ok: false;
      step: string;
      failureCategory: PublishFailureCategory;
      code?: string;
      message: string;
      stack?: string;
    };

type ContractInput = {
  registryDependencies?: unknown;
  previewProps?: unknown;
  previewExport?: unknown;
  provenance?: unknown;
  provenancePolicy?: unknown;
  applyStubInference?: unknown;
};

/**
 * Read-only publish preflight for agents: same core gates as publish (contract + optional preview smoke).
 * Does not write to the registry.
 */
export async function diagnosePublishReadiness(params: {
  name: string;
  type: string;
  title?: string;
  content?: string;
  code?: string;
  files?: Record<string, string>;
  input: ContractInput;
  requestUserId: string;
  /** When true, runs preview build/render smoke (slower; matches publish gate). Default false. */
  runPreviewSmoke?: boolean;
}): Promise<DiagnosePublishReadinessResult> {
  const runPreviewSmoke = params.runPreviewSmoke ?? false;
  const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!nameRegex.test(params.name)) {
    return {
      ok: false,
      step: "name_format",
      failureCategory: "VALIDATION_FAILED",
      code: "INVALID_NAME",
      message: "Name must be kebab-case (e.g. my-component).",
    };
  }

  const type = normalizeRegistryItemType(params.type);
  const isTheme = type === REGISTRY_THEME_TYPE;
  const files =
    params.files && Object.keys(params.files).length > 0 ? params.files : undefined;
  const content = files ? undefined : params.content ?? params.code;

  if (!files && !content?.trim()) {
    return {
      ok: false,
      step: "missing_source",
      failureCategory: "VALIDATION_FAILED",
      code: "MISSING_SOURCE",
      message: "Provide `files` (multi-file bundle) or `content` / `code` (single file).",
    };
  }

  let normalizedTheme: { files?: Record<string, string>; content?: string | undefined };
  try {
    normalizedTheme = normalizePublishThemeArgs({
      type,
      files: files ?? null,
      content: params.content,
      code: params.code,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      step: "theme_normalize",
      failureCategory: "VALIDATION_FAILED",
      code: "THEME_TOKENS_INVALID",
      message,
    };
  }

  if (!isTheme && content) {
    const validation = validateTsx(content);
    if (!validation.valid) {
      return {
        ok: false,
        step: "tsx_syntax",
        failureCategory: "VALIDATION_FAILED",
        code: "TSX_INVALID",
        message: validation.error ?? "Invalid TSX",
      };
    }
    const rel = extractDependencies(content).filter((d) => isRelativeImport(d));
    if (rel.length > 0) {
      return {
        ok: false,
        step: "relative_imports_single_file",
        failureCategory: "VALIDATION_FAILED",
        code: "BUNDLE_REQUIRED",
        message:
          "Relative imports require a multi-file `files` map. Detected: " +
          rel.slice(0, 8).join(", ") +
          (rel.length > 8 ? ` (+${rel.length - 8} more)` : ""),
      };
    }
    const appUsages = findAppSpecificUsage([content]);
    if (appUsages.length > 0) {
      return {
        ok: false,
        step: "app_specific_usage",
        failureCategory: "VALIDATION_FAILED",
        code: "APP_SPECIFIC_USAGE",
        message:
          "Registry components must not embed app hooks/providers. Detected: " +
          appUsages.join(", "),
      };
    }
  }

  if (!isTheme && files) {
    const contractForStubs = normalizePublishContract({
      mode: "create",
      input: params.input,
      files,
    });
    const normalizedForValidation =
      contractForStubs.ok && contractForStubs.value.filesToWrite
        ? contractForStubs.value.filesToWrite
        : files;

    const bundleValidation = validateComponentBundle(normalizedForValidation);
    if (bundleValidation.invalidFiles?.length) {
      return {
        ok: false,
        step: "bundle_invalid_files",
        failureCategory: "VALIDATION_FAILED",
        code: "BUNDLE_INVALID_FILE",
        message:
          "Multi-file bundle contains invalid code files: " +
          bundleValidation.invalidFiles.slice(0, 12).join(", ") +
          (bundleValidation.invalidFiles.length > 12
            ? ` (+${bundleValidation.invalidFiles.length - 12} more)`
            : ""),
      };
    }
    const missing =
      bundleValidation.missingImports ?? findMissingRelativeImports(normalizedForValidation);
    if (missing.length > 0) {
      return {
        ok: false,
        step: "bundle_missing_imports",
        failureCategory: "VALIDATION_FAILED",
        code: "BUNDLE_MISSING_IMPORT",
        message:
          "Missing local import targets in `files`: " +
          missing.slice(0, 12).join(", ") +
          (missing.length > 12 ? ` (+${missing.length - 12} more)` : ""),
      };
    }
    const appUsages = findAppSpecificUsage(
      Object.values(normalizedForValidation).filter((v): v is string => typeof v === "string"),
    );
    if (appUsages.length > 0) {
      return {
        ok: false,
        step: "app_specific_usage_bundle",
        failureCategory: "VALIDATION_FAILED",
        code: "APP_SPECIFIC_USAGE",
        message:
          "Registry components must not embed app hooks/providers. Detected: " +
          appUsages.join(", "),
      };
    }
  }

  if (isTheme && !files) {
    if (!content?.trim()) {
      return {
        ok: false,
        step: "theme_content",
        failureCategory: "VALIDATION_FAILED",
        code: "THEME_EMPTY",
        message: "Theme content is required (CSS or tokens JSON).",
      };
    }
  }

  const contract = normalizePublishContract({
    mode: "create",
    input: params.input,
    files: (normalizedTheme.files ?? files) as Record<string, string> | undefined,
  });

  if (!contract.ok) {
    return {
      ok: false,
      step: "publish_contract",
      failureCategory: publishFailureCategoryForCode(contract.code),
      code: contract.code,
      message: contract.error,
    };
  }

  const nextFiles = contract.value.filesToWrite ?? normalizedTheme.files ?? files;
  const nextRegistryDependencies = contract.value.registryDependenciesToWrite ?? [];

  const previewAdvice = !isTheme
    ? diagnosePreviewExports({
        name: params.name,
        previewExport:
          typeof contract.value.previewExport === "string"
            ? contract.value.previewExport
            : undefined,
        files: nextFiles,
        content: nextFiles ? null : normalizedTheme.content ?? content ?? undefined,
      })
    : undefined;

  if (!isTheme && runPreviewSmoke) {
    const smoke = await runRegistryPreviewSmokeTest({
      name: params.name,
      files: nextFiles,
      content: nextFiles ? null : normalizedTheme.content ?? content ?? undefined,
      previewProps: contract.value.previewProps,
      previewExport: contract.value.previewExport,
      registryDependencies: nextRegistryDependencies,
      requestUserId: params.requestUserId,
    });
    if (!smoke.ok) {
      return {
        ok: false,
        step: "preview_smoke",
        failureCategory: publishFailureCategoryForCode(smoke.code),
        code: smoke.code,
        message: smoke.message,
        stack: smoke.stack,
      };
    }
  }

  const d = contract.value.diagnostics;
  return {
    ok: true,
    runPreviewSmoke,
    summary: runPreviewSmoke
      ? "Contract and preview smoke passed; publish should pass the same gates (create flow)."
      : "Contract normalization passed. Re-run with runPreviewSmoke: true to match full publish preview gate.",
    previewAdvice,
    publishDiagnostics: {
      droppedPaths: d.droppedPaths,
      dirtyDependencyPaths: d.dirtyDependencyPaths,
      stubInferredRegistryDependencies: d.stubInferredRegistryDependencies,
      stubInferenceMergedIntoWrite: d.stubInferenceMergedIntoWrite,
      policyApplied: d.policyApplied,
    },
  };
}

function diagnosePreviewExports(params: {
  name: string;
  previewExport?: string;
  files?: Record<string, string> | undefined;
  content?: string | null | undefined;
}) {
  const sources: string[] = [];
  if (params.files) {
    for (const [filePath, src] of Object.entries(params.files)) {
      if (!/\.(tsx?|jsx?)$/i.test(filePath)) continue;
      if (typeof src === "string") sources.push(src);
    }
  } else if (typeof params.content === "string") {
    sources.push(params.content);
  }

  const exports = new Set<string>();
  let hasDefaultExport = false;
  for (const src of sources) {
    if (/\bexport\s+default\b/.test(src)) hasDefaultExport = true;
    const matches = src.matchAll(/\bexport\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g);
    for (const m of matches) {
      if (m[1]) exports.add(m[1]);
    }
    const namedList = src.match(/\bexport\s*\{\s*([^}]+)\s*\}/);
    if (namedList && namedList[1]) {
      for (const part of namedList[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/i)[0]?.trim();
        if (name) exports.add(name);
      }
    }
  }

  const detectedExports = Array.from(exports).sort();
  const recommendedPreviewExport =
    typeof params.previewExport === "string" && params.previewExport.trim()
      ? params.previewExport.trim()
      : detectedExports.includes("PreviewComponent")
        ? "PreviewComponent"
        : detectedExports.includes(slugToPascalExportName(params.name))
          ? slugToPascalExportName(params.name)
          : detectedExports.includes(slugToCamelExportName(params.name))
            ? slugToCamelExportName(params.name)
            : detectedExports.length === 1
              ? detectedExports[0]!
              : null;

  const note =
    hasDefaultExport
      ? null
      : recommendedPreviewExport
        ? `No default export detected. Consider setting previewExport: "${recommendedPreviewExport}".`
        : "No default export detected. Consider adding a default export or providing previewExport.";

  return {
    detectedExports,
    hasDefaultExport,
    recommendedPreviewExport,
    note,
  };
}

function slugToPascalExportName(slug: string): string {
  return slug
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((s) => (s[0] ? s[0].toUpperCase() + s.slice(1) : ""))
    .join("");
}

function slugToCamelExportName(slug: string): string {
  const parts = slug.split(/[^a-zA-Z0-9]/).filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  const head = first ? first[0].toLowerCase() + first.slice(1) : "";
  const tail = rest.map((p) => (p[0] ? p[0].toUpperCase() + p.slice(1) : "")).join("");
  return head + tail;
}
