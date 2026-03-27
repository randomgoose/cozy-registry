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
import { resolvePublishTargetForUser } from "@/lib/publish-target";

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
      publishScope?: "personal" | "team";
      targetRef?: string | null;
      organizationSlug?: string | null;
      teamSlug?: string | null;
      teamId?: string | null;
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
    if (Object.prototype.hasOwnProperty.call(body, "registryDependencies")) {
      const nd = normalizeRegistryDependenciesInput(body.registryDependencies);
      if (nd.error) {
        return NextResponse.json(
          { error: nd.error, code: "REGDEP_INVALID_FORMAT" },
          { status: 400 },
        );
      }
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
      publishScope: body.publishScope === "team" ? "team" : "personal",
      targetRef: typeof body.targetRef === "string" ? body.targetRef : null,
      organizationSlug:
        typeof body.organizationSlug === "string" ? body.organizationSlug : null,
      teamSlug: typeof body.teamSlug === "string" ? body.teamSlug : null,
      teamId: typeof body.teamId === "string" ? body.teamId : null,
      activeTeamId: session?.session?.activeTeamId ?? null,
    });

    if (!resolvedPublishTarget.ok) {
      const status =
        resolvedPublishTarget.code === "AMBIGUOUS_TEAM_TARGET"
          ? 400
          : resolvedPublishTarget.code === "NO_TEAM_WRITE_ACCESS"
            ? 403
            : 400;
      return NextResponse.json(
        {
          error: resolvedPublishTarget.message,
          code: resolvedPublishTarget.code,
          candidates: resolvedPublishTarget.candidates?.map((candidate) => ({
            teamId: candidate.id,
            teamName: candidate.name,
            organizationName: candidate.organizationName,
            organizationSlug: candidate.organizationSlug,
            teamSlug: candidate.teamSlug,
            targetRef: candidate.targetRef,
            role: candidate.role,
          })),
        },
        { status },
      );
    }

    const publishTarget = resolvedPublishTarget.target;
    const teamTarget = publishTarget.kind === "team" ? publishTarget : null;

    const isTheme = normalizedType === REGISTRY_THEME_TYPE;
    if (!hasFiles) {
      // 单文件模式校验
      if (!isTheme) {
        const validation = validateTsx(content as string);
        if (!validation.valid) {
          return NextResponse.json(
            { error: `Invalid TSX: ${validation.error}` },
            { status: 400 }
          );
        }
      } else if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json(
          { error: "Theme content is required (either CSS or tokens JSON)" },
          { status: 400 }
        );
      }
    }

    const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!nameRegex.test(name)) {
      return NextResponse.json(
        { error: "Name must be kebab-case (e.g. my-component)" },
        { status: 400 }
      );
    }

    const validTypes = [REGISTRY_BLOCK_TYPE, REGISTRY_UI_TYPE, REGISTRY_THEME_TYPE] as const;
    if (!validTypes.includes(normalizedType as (typeof validTypes)[number])) {
      return NextResponse.json(
        {
          error:
            `Type must be ${REGISTRY_BLOCK_TYPE}, ${REGISTRY_UI_TYPE}, or ${REGISTRY_THEME_TYPE}. ` +
            `${LEGACY_REGISTRY_COMPONENT_TYPE} is accepted as a legacy alias.`,
        },
        { status: 400 }
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
            { error: "Failed to derive CSS from tokens.json (no tokens found)" },
            { status: 400 }
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
        { error: contract.error, code: contract.code },
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
          },
          { status: 400 },
        );
      }
    }

    const filesToWrite = contract.value.filesToWrite ?? normalizedFiles;
    const depsToWrite = contract.value.registryDependenciesToWrite ?? [];

    const item = await createRegistryItem({
      name,
      type: normalizedType,
      title,
      description: description || null,
      content: filesToWrite ? undefined : normalizedContent,
      files: filesToWrite,
      userId: teamTarget ? null : userId,
      teamId: teamTarget?.id ?? null,
      visibility: validVisibility,
      dependencies,
      registryDependencies: depsToWrite,
      previewProps: contract.value.previewProps,
      previewExport: contract.value.previewExport,
    });

    return NextResponse.json({
      success: true,
      item,
      publishTarget: teamTarget
        ? {
            kind: "team",
            teamId: teamTarget.id,
            teamName: teamTarget.name,
            organizationId: teamTarget.organizationId,
            organizationName: teamTarget.organizationName,
            organizationSlug: teamTarget.organizationSlug,
            teamSlug: teamTarget.teamSlug,
            targetRef: teamTarget.targetRef,
          }
        : { kind: "user", userId, targetRef: "personal" },
      hints,
      publishDiagnostics: {
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
