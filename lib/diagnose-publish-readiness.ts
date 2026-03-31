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
  REGISTRY_THEME_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { parseTokensFromJson, tokensToRootCss } from "@/lib/theme-tokens";
import { getPreviewExportAdvice } from "@/lib/publish-readiness-rules";

type PublishFailureCategory =
  | "VALIDATION_FAILED"
  | "PREVIEW_BUILD_FAILED"
  | "PREVIEW_RENDER_FAILED";

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
    ? getPreviewExportAdvice({
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

function publishFailureCategoryForCode(code?: string): PublishFailureCategory {
  if (code === "PREVIEW_BUILD_FAILED") return "PREVIEW_BUILD_FAILED";
  if (code === "PREVIEW_RENDER_FAILED") return "PREVIEW_RENDER_FAILED";
  return "VALIDATION_FAILED";
}

function normalizePublishThemeArgs(args: {
  type: string;
  files?: Record<string, string> | null;
  content?: string;
  code?: string;
}): { files?: Record<string, string>; content?: string | undefined } {
  if (normalizeRegistryItemType(args.type) !== REGISTRY_THEME_TYPE) {
    return { files: args.files ?? undefined, content: args.content ?? args.code };
  }

  const rawFiles = (args.files || {}) as Record<string, unknown>;
  const hasFiles = rawFiles && Object.keys(rawFiles).length > 0;
  let tokensJson = "";

  if (hasFiles && typeof rawFiles["tokens.json"] === "string") {
    tokensJson = rawFiles["tokens.json"] as string;
  } else if (typeof args.content === "string" && args.content.trim().startsWith("{")) {
    tokensJson = args.content;
  } else if (typeof args.code === "string" && args.code.trim().startsWith("{")) {
    tokensJson = args.code;
  }

  if (!tokensJson) {
    return {
      files: hasFiles
        ? (Object.fromEntries(
            Object.entries(rawFiles).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>)
        : undefined,
      content: args.content ?? args.code,
    };
  }

  const tokens = parseTokensFromJson(tokensJson);
  const css = tokensToRootCss(tokens);
  if (!css) {
    throw new Error("Failed to derive CSS from tokens.json (no tokens found)");
  }

  return {
    files: {
      "theme.css": css,
      "tokens.json": tokensJson,
    },
    content: undefined,
  };
}

function findAppSpecificUsage(sources: string[]): string[] {
  const APP_HOOK_PATTERNS = [
    "useLanguage(",
    "useI18n(",
    "useTranslations(",
    "useAuth(",
    "useSession(",
    "useWallet(",
    "useRouter(",
    "useSearchParams(",
    "useQueryClient(",
    "useQuery(",
    "useMutation(",
  ];

  const APP_PROVIDER_PATTERNS = [
    "LanguageProvider",
    "I18nProvider",
    "AuthProvider",
    "SessionProvider",
    "WalletProvider",
    "QueryClientProvider",
    "RouterProvider",
  ];

  const hits = new Set<string>();
  for (const src of sources) {
    if (typeof src !== "string") continue;
    for (const p of APP_HOOK_PATTERNS) {
      if (src.includes(p)) hits.add(p.replace("(", ""));
    }
    for (const p of APP_PROVIDER_PATTERNS) {
      if (src.includes(`<${p}`) || src.includes(`${p} `)) hits.add(p);
    }
  }
  return Array.from(hits).sort();
}
