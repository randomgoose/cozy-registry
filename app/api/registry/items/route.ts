import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createRegistryItem } from "@/lib/registry";
import {
  validateTsx,
  extractDependencies,
  validateComponentBundle,
} from "@/lib/validate-tsx";
import {
  LEGACY_REGISTRY_COMPONENT_TYPE,
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { parseTokensFromJson, tokensToRootCss } from "@/lib/theme-tokens";
import { auth } from "@/lib/auth";
import { getUserIdFromToken } from "@/lib/auth-api";
import { analyzeUploadStyleHints } from "@/lib/upload-style-hints";
import { normalizePublishContract } from "@/lib/registry-publish-contract";
import { normalizeRegistryDependenciesInput } from "@/lib/registry-dependency-input";
import { normalizeThirdPartyDependenciesInput } from "@/lib/third-party-dependency-input";
import {
  evaluateThirdPartyDependencies,
  excludeExplicitRegistryDependencies,
  getRejectedDependencyDecisions,
} from "@/lib/third-party-dependency-governance";
import { resolvePublishTargetForUser } from "@/lib/publish-target";
import { runRegistryPreviewSmokeTest } from "@/lib/registry-preview-smoke";
import { publishFailureCategoryForCode } from "@/lib/registry-publish-failure";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, title, description, content, files, visibility } = body as {
      name?: string;
      type?: string;
      title?: string;
      description?: string | null;
      content?: string | null;
      files?: Record<string, unknown> | null;
      visibility?: string | null;
      registryDependencies?: unknown;
      previewProps?: unknown;
      previewExport?: unknown;
      publishScope?: "personal" | "organization";
      targetRef?: string | null;
      organizationSlug?: string | null;
      organizationId?: string | null;
      dependencies?: unknown;
    };

    const hasFiles =
      files &&
      typeof files === "object" &&
      !Array.isArray(files) &&
      Object.keys(files as Record<string, unknown>).length > 0;

    const normalizedType =
      typeof type === "string" ? normalizeRegistryItemType(type) : "";

    if (!name || !normalizedType || !title || (!hasFiles && !content)) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, title, and (files or content)" },
        { status: 400 }
      );
    }
    const normalizedRegistryDeps = normalizeRegistryDependenciesInput(
      body.registryDependencies,
    );
    if (Object.prototype.hasOwnProperty.call(body, "registryDependencies")) {
      if (normalizedRegistryDeps.error) {
        return NextResponse.json(
          {
            error: normalizedRegistryDeps.error,
            code: "REGDEP_INVALID_FORMAT",
            failureCategory: publishFailureCategoryForCode("REGDEP_INVALID_FORMAT"),
          },
          { status: 400 },
        );
      }
    }
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

    let userId: string | null = null;
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id) userId = session.user.id;
    if (!userId) userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Sign in or provide Authorization: Bearer <token>" },
        { status: 401 }
      );
    }

    const resolvedPublishTarget = await resolvePublishTargetForUser({
      userId,
      publishScope: body.publishScope === "organization" ? "organization" : "personal",
      targetRef: typeof body.targetRef === "string" ? body.targetRef : null,
      organizationSlug:
        typeof body.organizationSlug === "string" ? body.organizationSlug : null,
      organizationId: typeof body.organizationId === "string" ? body.organizationId : null,
      activeOrganizationId: session?.session?.activeOrganizationId ?? null,
    });

    if (!resolvedPublishTarget.ok) {
      const status =
        resolvedPublishTarget.code === "AMBIGUOUS_ORG_TARGET"
          ? 400
          : resolvedPublishTarget.code === "NO_ORG_WRITE_ACCESS"
            ? 403
            : 400;
      return NextResponse.json(
        {
          error: resolvedPublishTarget.message,
          code: resolvedPublishTarget.code,
          failureCategory: publishFailureCategoryForCode(resolvedPublishTarget.code),
          candidates: resolvedPublishTarget.candidates?.map((candidate) => ({
            organizationId: candidate.id,
            organizationName: candidate.name,
            organizationSlug: candidate.slug,
            targetRef: candidate.targetRef,
            role: candidate.role,
          })),
        },
        { status },
      );
    }

    const publishTarget = resolvedPublishTarget.target;
    const orgTarget = publishTarget.kind === "organization" ? publishTarget : null;

    const isTheme = normalizedType === REGISTRY_THEME_TYPE;
    if (!hasFiles) {
      // 单文件模式校验
      if (!isTheme) {
        const validation = validateTsx(content as string);
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
      } else if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json(
          {
            error: "Theme content is required (either CSS or tokens JSON)",
            code: "THEME_EMPTY",
            failureCategory: publishFailureCategoryForCode("THEME_EMPTY"),
          },
          { status: 400 },
        );
      }
    }

    const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!nameRegex.test(name)) {
      return NextResponse.json(
        {
          error: "Name must be kebab-case (e.g. my-component)",
          code: "INVALID_NAME",
          failureCategory: publishFailureCategoryForCode("INVALID_NAME"),
        },
        { status: 400 },
      );
    }

    const validTypes = [REGISTRY_BLOCK_TYPE, REGISTRY_UI_TYPE, REGISTRY_THEME_TYPE] as const;
    if (!validTypes.includes(normalizedType as (typeof validTypes)[number])) {
      return NextResponse.json(
        {
          error:
            `Type must be ${REGISTRY_BLOCK_TYPE}, ${REGISTRY_UI_TYPE}, or ${REGISTRY_THEME_TYPE}. ` +
            `${LEGACY_REGISTRY_COMPONENT_TYPE} is accepted as a legacy alias.`,
          code: "INVALID_TYPE",
          failureCategory: publishFailureCategoryForCode("INVALID_TYPE"),
        },
        { status: 400 },
      );
    }

    // 规范化 theme：若 type === registry:theme，优先将 content 或 files 中的 JSON 视为 tokens.json，
    // 并从中派生 theme.css（:root 视图）。
    let normalizedFiles: Record<string, string> | undefined;
    let normalizedContent: string | undefined | null = content ?? undefined;

    if (isTheme) {
      const asRecord =
        files && typeof files === "object" && !Array.isArray(files)
          ? (files as Record<string, unknown>)
          : null;
      let tokensJson = "";

      if (asRecord && typeof asRecord["tokens.json"] === "string") {
        tokensJson = asRecord["tokens.json"] as string;
      } else if (typeof content === "string" && content.trim().startsWith("{")) {
        tokensJson = content;
      }

      if (tokensJson) {
        const tokens = parseTokensFromJson(tokensJson);
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
        normalizedFiles = {
          "theme.css": css,
          "tokens.json": tokensJson,
        };
        normalizedContent = undefined;
      }
    }

    const validVisibility = visibility === "private" ? "private" : "public";
    // 仅保留裸模块依赖（npm 包），忽略相对路径 import
    const dependencies = (() => {
      if (isTheme) return [];
      const isBare = (spec: string) =>
        !spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("/");
      const all = new Set<string>();

      const addDepsFromSource = (src: string | undefined | null) => {
        if (!src) return;
        for (const dep of extractDependencies(src)) {
          if (isBare(dep)) all.add(dep);
        }
      };

      if (hasFiles && !normalizedFiles) {
        for (const src of Object.values(files as Record<string, unknown>)) {
          if (typeof src !== "string") continue;
          addDepsFromSource(src);
        }
      } else {
        addDepsFromSource(normalizedContent ?? content);
      }

      return Array.from(all).sort();
    })();
    const dependencyDecisions = evaluateThirdPartyDependencies({
      discovered: excludeExplicitRegistryDependencies(
        dependencies,
        normalizedRegistryDeps.value,
      ),
      declared: normalizedDeclaredDependencies.value,
    });
    const rejectedDependencies = getRejectedDependencyDecisions(
      dependencyDecisions,
    );
    if (rejectedDependencies.length > 0) {
      const lines = rejectedDependencies
        .map((decision) => `- ${decision.packageName}: ${decision.message}`)
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

    if (!normalizedFiles && hasFiles) {
      normalizedFiles = Object.fromEntries(
        Object.entries(files as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, v as string])
      ) as Record<string, string>;
    }
    const hints = analyzeUploadStyleHints({
      itemType: normalizedType,
      files: normalizedFiles ?? undefined,
      content: normalizedFiles ? null : normalizedContent,
    });

    const contract = normalizePublishContract({
      mode: "create",
      input: body as {
        registryDependencies?: unknown;
        previewProps?: unknown;
        previewExport?: unknown;
        provenance?: unknown;
        provenancePolicy?: unknown;
        applyStubInference?: unknown;
      },
      files: normalizedFiles,
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

    if (!isTheme && normalizedFiles && Object.keys(normalizedFiles).length > 0) {
      const toValidate =
        contract.value.filesToWrite ?? normalizedFiles;
      const validation = validateComponentBundle(toValidate);
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

    const filesToWrite = contract.value.filesToWrite ?? normalizedFiles;
    const depsToWrite = contract.value.registryDependenciesToWrite ?? [];
    let previewDependencyResolutionDiagnostics: unknown[] = [];

    if (!isTheme) {
      const smoke = await runRegistryPreviewSmokeTest({
        name,
        files: filesToWrite,
        content: filesToWrite ? null : normalizedContent,
        previewProps: contract.value.previewProps,
        previewExport: contract.value.previewExport,
        registryDependencies: depsToWrite,
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
    const item = await createRegistryItem({
      name,
      type: normalizedType,
      title,
      description: description || null,
      content: filesToWrite ? undefined : normalizedContent,
      files: filesToWrite,
      userId: orgTarget ? null : userId,
      organizationId: orgTarget?.id ?? null,
      visibility: validVisibility,
      dependencies,
      declaredDependencies: normalizedDeclaredDependencies.value,
      dependencyDecisions,
      registryDependencies: depsToWrite,
      previewProps: contract.value.previewProps,
      previewExport: contract.value.previewExport,
    });

    return NextResponse.json({
      success: true,
      item,
      publishTarget: orgTarget
        ? {
            kind: "organization",
            organizationId: orgTarget.id,
            organizationName: orgTarget.name,
            organizationSlug: orgTarget.slug,
            targetRef: orgTarget.targetRef,
          }
        : { kind: "user", userId, targetRef: "personal" },
      hints,
      publishDiagnostics: {
        dependencyDiagnostics: dependencyDecisions,
        previewDependencyResolutionDiagnostics,
        appliedRegistryDependencies: contract.value.appliedRegistryDependencies ?? depsToWrite,
        droppedPaths: contract.value.diagnostics.droppedPaths,
        dirtyDependencyPaths: contract.value.diagnostics.dirtyDependencyPaths,
        stubInferredRegistryDependencies:
          contract.value.diagnostics.stubInferredRegistryDependencies,
        stubInferenceMergedIntoWrite:
          contract.value.diagnostics.stubInferenceMergedIntoWrite,
        policyApplied: contract.value.diagnostics.policyApplied,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "A component with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
