import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserIdFromToken } from "@/lib/auth-api";
import {
  getRegistryItemVersionsScoped,
  getRegistryItemByScopedIdentityAndVersion,
  createRegistryItemVersion,
  getCurrentVersion,
} from "@/lib/registry";
import {
  REGISTRY_THEME_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import {
  extractDependencies,
  validateComponentBundle,
  validateTsx,
  isBarePackageSpecifier,
} from "@/lib/validate-tsx";
import { parseTokensFromJson, tokensToRootCss } from "@/lib/theme-tokens";
import { analyzeUploadStyleHints } from "@/lib/upload-style-hints";
import { normalizeRegistryDependenciesInput } from "@/lib/registry-dependency-input";
import { normalizePublishContract } from "@/lib/registry-publish-contract";
import { normalizeThirdPartyDependenciesInput } from "@/lib/third-party-dependency-input";
import {
  evaluateThirdPartyDependencies,
  excludeExplicitRegistryDependencies,
  getDependencyDisplayName,
  getRejectedDependencyDecisions,
} from "@/lib/third-party-dependency-governance";
import { getWritableOrganizationTargetForUser } from "@/lib/publish-target";
import { runRegistryPreviewSmokeTest } from "@/lib/registry-preview-smoke";
import { publishFailureCategoryForCode } from "@/lib/registry-publish-failure";
import { resolveCanonicalRegistryProjectForWrite } from "@/lib/registry-project-access";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";

type Params = { params: Promise<{ owner: string; name: string }> };

type VersionRequestBody = {
  content?: string;
  files?: Record<string, unknown>;
  bump?: "patch" | "minor" | "major";
  message?: string;
  registryDependencies?: unknown;
  previewProps?: unknown;
  previewExport?: unknown;
  provenance?: unknown;
  provenancePolicy?: unknown;
  applyStubInference?: unknown;
  dependencies?: unknown;
  project?: string | null;
  previewStories?: unknown;
  previewDefaultStoryId?: string | null;
  themeResourceRef?: string | null;
};

/** 获取组件的版本列表 + 当前版本 */
export async function GET(request: Request, { params }: Params) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const projectParam = url.searchParams.get("project");
  const project =
    typeof projectParam === "string" && projectParam.trim().length > 0
      ? projectParam.trim()
      : null;
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;

  const item = await getRegistryItemByScopedIdentityAndVersion({
    ownerId: owner,
    projectKey: project,
    name,
    version: null,
    requestUserId: userId,
  });
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const versions = await getRegistryItemVersionsScoped({
    ownerId: owner,
    projectKey: project,
    name,
    requestUserId: userId,
  });
  const currentVersion = getCurrentVersion(item);

  return NextResponse.json({
    currentVersion,
    versions: versions.map((v) => ({
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      message: v.message ?? null,
    })),
  });
}

/** 发布新版本（Vibe 更新组件时调用），需登录且为 owner */
export async function POST(request: Request, { params }: Params) {
  const { owner, name } = await params;
  const session = await auth.api.getSession({ headers: request.headers });
  let userId = session?.user?.id ?? null;
  if (!userId) {
    userId = await getUserIdFromToken(request);
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: VersionRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (typeof body.project !== "string" || body.project.trim().length === 0) {
    return NextResponse.json(
      {
        error: "Missing required field: project",
        code: "PROJECT_REQUIRED",
        failureCategory: publishFailureCategoryForCode("PROJECT_NOT_FOUND_OR_FORBIDDEN"),
      },
      { status: 400 },
    );
  }

  const { content, files, bump, message } = body;
  const normalizedDeclaredDependencies = normalizeThirdPartyDependenciesInput(
    body.dependencies,
  );
  if (normalizedDeclaredDependencies.error) {
    return NextResponse.json(
      {
        error: normalizedDeclaredDependencies.error,
        code: "DEPENDENCIES_INVALID_FORMAT",
        failureCategory: publishFailureCategoryForCode("DEPENDENCIES_INVALID_FORMAT"),
      },
      { status: 400 },
    );
  }
  const normalizedRegistryDependencies = normalizeRegistryDependenciesInput(
    body.registryDependencies,
  );
  if (normalizedRegistryDependencies.error) {
    return NextResponse.json(
      {
        error: normalizedRegistryDependencies.error,
        code: "REGDEP_INVALID_FORMAT",
        failureCategory: publishFailureCategoryForCode("REGDEP_INVALID_FORMAT"),
      },
      { status: 400 },
    );
  }
  const themeResourceRef =
    typeof body.themeResourceRef === "string" &&
    body.themeResourceRef.trim().length > 0
      ? body.themeResourceRef.trim()
      : null;
  if (themeResourceRef && !parseRegistryDependencyRef(themeResourceRef)) {
    return NextResponse.json(
      {
        error: "themeResourceRef must be a valid registry ref",
        code: "THEME_RESOURCE_REF_INVALID",
        failureCategory: publishFailureCategoryForCode("REGDEP_INVALID_FORMAT"),
      },
      { status: 400 },
    );
  }

  const item = await getRegistryItemByScopedIdentityAndVersion({
    ownerId: owner,
    projectKey: typeof body.project === "string" ? body.project : null,
    name,
    version: null,
    requestUserId: userId,
  });
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (item.organizationId) {
    const writable = await getWritableOrganizationTargetForUser(userId, item.organizationId);
    if (!writable) {
      return NextResponse.json(
        { error: "You do not have publish access to this organization registry." },
        { status: 403 },
      );
    }
  } else if (item.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canonicalProject = await resolveCanonicalRegistryProjectForWrite({
    userId,
    projectSlug: typeof body.project === "string" ? body.project : null,
    ownerUserId: item.organizationId ? null : item.userId,
    organizationId: item.organizationId ?? null,
  });
  if (!canonicalProject.ok) {
    return NextResponse.json(
      {
        error: canonicalProject.error,
        code: "PROJECT_NOT_FOUND_OR_FORBIDDEN",
        failureCategory: publishFailureCategoryForCode("PROJECT_NOT_FOUND_OR_FORBIDDEN"),
      },
      { status: canonicalProject.status },
    );
  }

  const normalizedType = normalizeRegistryItemType(item.type);
  const isTheme = normalizedType === REGISTRY_THEME_TYPE;
  const normalizedFiles =
    files && typeof files === "object" && !Array.isArray(files)
      ? Object.fromEntries(
          Object.entries(files).filter(([, value]) => typeof value === "string"),
        )
      : undefined;
  const hasFiles = !!normalizedFiles && Object.keys(normalizedFiles).length > 0;
  const normalizedContent =
    typeof content === "string" && content.trim().length > 0
      ? content.trim()
      : undefined;

  if (!hasFiles && !normalizedContent) {
    return NextResponse.json(
      {
        error: "content or files is required",
        code: "MISSING_SOURCE",
        failureCategory: publishFailureCategoryForCode("MISSING_SOURCE"),
      },
      { status: 400 },
    );
  }

  let finalFiles = hasFiles ? (normalizedFiles as Record<string, string>) : undefined;
  let finalContent = normalizedContent;

  if (isTheme) {
    const maybeTokensJson =
      (finalFiles && typeof finalFiles["tokens.json"] === "string"
        ? finalFiles["tokens.json"]
        : undefined) ??
      (typeof finalContent === "string" && finalContent.trim().startsWith("{")
        ? finalContent
        : undefined);

    if (maybeTokensJson) {
      const tokens = parseTokensFromJson(maybeTokensJson);
      const css = tokensToRootCss(tokens);
      if (!css) {
        return NextResponse.json(
          {
            error: "Failed to derive CSS from tokens.json (no tokens found)",
            code: "THEME_TOKENS_INVALID",
            failureCategory: publishFailureCategoryForCode("THEME_TOKENS_INVALID"),
          },
          { status: 400 },
        );
      }
      finalFiles = {
        "theme.css": css,
        "tokens.json": maybeTokensJson,
      };
      finalContent = undefined;
    }
  }

  const dependencies = (() => {
    if (isTheme) return [];
    const all = new Set<string>();
    const addDepsFromSource = (src: string | undefined) => {
      if (!src) return;
      for (const dep of extractDependencies(src)) {
        if (isBarePackageSpecifier(dep)) all.add(dep);
      }
    };
    if (finalFiles) {
      for (const src of Object.values(finalFiles)) {
        addDepsFromSource(src);
      }
    } else {
      addDepsFromSource(finalContent);
    }
    return Array.from(all).sort();
  })();
  const dependencyDecisions = evaluateThirdPartyDependencies({
    discovered: excludeExplicitRegistryDependencies(
      dependencies,
      normalizedRegistryDependencies.value,
    ),
    declared: normalizedDeclaredDependencies.value,
  });
  const rejectedDependencies = getRejectedDependencyDecisions(
    dependencyDecisions,
  );
  if (rejectedDependencies.length > 0) {
    const lines = rejectedDependencies
      .map((decision) => `- ${getDependencyDisplayName(decision)}: ${decision.message}`)
      .join("\n");
    return NextResponse.json(
      {
        error: `Unsupported third-party dependencies:\n${lines}`,
        code: "THIRD_PARTY_DEPENDENCY_REJECTED",
        failureCategory: publishFailureCategoryForCode("THIRD_PARTY_DEPENDENCY_REJECTED"),
        dependencyDiagnostics: dependencyDecisions,
      },
      { status: 400 },
    );
  }

  const contract = normalizePublishContract({
    mode: "version",
    input: body as {
      registryDependencies?: unknown;
      previewProps?: unknown;
      previewExport?: unknown;
      provenance?: unknown;
      provenancePolicy?: unknown;
      applyStubInference?: unknown;
    },
    files: finalFiles,
    previousRegistryDependencies: (item.registryDependencies ?? []) as string[],
  });
  if (!contract.ok) {
    return NextResponse.json(
      {
        error: contract.error,
        code: contract.code,
        failureCategory: publishFailureCategoryForCode(contract.code),
      },
      { status: 400 },
    );
  }

  if (finalFiles) {
    if (isTheme) {
      const hasThemePayload =
        Object.keys(finalFiles).length > 0 &&
        Object.values(finalFiles).some(
          (value) => typeof value === "string" && value.trim().length > 0,
        );
      if (!hasThemePayload) {
        return NextResponse.json(
          {
            error: "Theme files must include CSS or tokens content",
            code: "THEME_EMPTY",
            failureCategory: publishFailureCategoryForCode("THEME_EMPTY"),
          },
          { status: 400 },
        );
      }
    } else {
    const validation = validateComponentBundle(
      (contract.value.filesToWrite ?? finalFiles) as Record<string, string>,
    );
    if (!validation.valid) {
      const details =
        validation.invalidFiles?.length
          ? validation.invalidFiles.slice(0, 10).join("\n")
          : validation.missingImports?.slice(0, 20).join("\n");
      return NextResponse.json(
        {
          error: details
            ? `${validation.error}:\n${details}`
            : validation.error ?? "Invalid component bundle",
          code: "BUNDLE_INVALID",
          failureCategory: publishFailureCategoryForCode("BUNDLE_INVALID"),
        },
        { status: 400 },
      );
    }
    }
  } else if (finalContent) {
    if (isTheme) {
      if (finalContent.trim().length === 0) {
        return NextResponse.json(
          {
            error: "Theme content is required",
            code: "THEME_EMPTY",
            failureCategory: publishFailureCategoryForCode("THEME_EMPTY"),
          },
          { status: 400 },
        );
      }
    } else {
      const validation = validateTsx(finalContent);
      if (!validation.valid) {
      return NextResponse.json(
        {
          error: `Invalid TSX: ${validation.error}`,
          code: "TSX_INVALID",
          failureCategory: publishFailureCategoryForCode("TSX_INVALID"),
        },
        { status: 400 },
      );
    }
    }
  }
  const bumpType = bump ?? "patch";
  if (!["patch", "minor", "major"].includes(bumpType)) {
    return NextResponse.json(
      { error: "bump must be patch, minor, or major" },
      { status: 400 }
    );
  }

  try {
    const hints = analyzeUploadStyleHints({
      itemType: normalizedType,
      files: finalFiles ?? undefined,
      content: finalFiles ? null : finalContent,
    });
    const nextFiles = contract.value.filesToWrite ?? finalFiles;
    const nextRegistryDependencies =
      contract.value.registryDependenciesToWrite ??
      ((item.registryDependencies ?? []) as string[]);
    let previewDependencyResolutionDiagnostics: unknown[] = [];
    if (!isTheme) {
      const smoke = await runRegistryPreviewSmokeTest({
        name,
        files: nextFiles,
        content: nextFiles ? null : finalContent,
        previewProps: contract.value.previewProps,
        previewExport: contract.value.previewExport,
        registryDependencies: nextRegistryDependencies,
        dependencyDecisions,
        requestUserId: userId,
      });
      if (!smoke.ok) {
        return NextResponse.json(
          {
            error: smoke.message,
            code: smoke.code,
            failureCategory: publishFailureCategoryForCode(smoke.code),
            stack: smoke.stack,
          },
          { status: 422 },
        );
      }
      previewDependencyResolutionDiagnostics =
        smoke.dependencyResolutionDiagnostics ?? [];
    }
    const result = await createRegistryItemVersion({
      ownerId: item.userId ?? undefined,
      organizationId: item.organizationId ?? undefined,
      canonicalProjectId:
        canonicalProject.project?.id ?? item.canonicalProjectId ?? null,
      canonicalProjectKey:
        canonicalProject.project?.namespaceKey ?? item.canonicalProjectKey ?? null,
      name,
      content: finalContent,
      files: nextFiles,
      bump: bumpType,
      userId,
      message: typeof message === "string" ? message : undefined,
      dependencies,
      declaredDependencies: normalizedDeclaredDependencies.value,
      dependencyDecisions,
      registryDependencies: contract.value.registryDependenciesToWrite,
      previewProps: contract.value.previewProps,
      previewExport: contract.value.previewExport,
      previewStories: body.previewStories,
      previewDefaultStoryId:
        typeof body.previewDefaultStoryId === "string" &&
        body.previewDefaultStoryId.trim().length > 0
          ? body.previewDefaultStoryId.trim()
          : undefined,
      themeResourceRef,
    });
    return NextResponse.json({
      version: result.version,
      hints,
      publishDiagnostics: {
        dependencyDiagnostics: dependencyDecisions,
        previewDependencyResolutionDiagnostics,
        appliedRegistryDependencies:
          contract.value.appliedRegistryDependencies ??
          contract.value.registryDependenciesToWrite ??
          ((item.registryDependencies ?? []) as string[]),
        droppedPaths: contract.value.diagnostics.droppedPaths,
        dirtyDependencyPaths: contract.value.diagnostics.dirtyDependencyPaths,
        stubInferredRegistryDependencies:
          contract.value.diagnostics.stubInferredRegistryDependencies,
        stubInferenceMergedIntoWrite:
          contract.value.diagnostics.stubInferenceMergedIntoWrite,
        policyApplied: contract.value.diagnostics.policyApplied,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("not found") || msg.includes("no access")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Only owner")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg.includes("cannot be modified")) {
      return NextResponse.json({ error: msg, code: "ITEM_ARCHIVED" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
