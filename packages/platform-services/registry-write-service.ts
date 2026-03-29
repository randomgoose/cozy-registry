import { createRegistryItem } from "@cozy/registry-domain/registry";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";
import { resolvePublishTargetForUser } from "@cozy/registry-domain/publish-target";
import { normalizeRegistryDependenciesInput } from "@cozy/registry-domain/registry-dependency-input";
import { normalizePublishContract } from "@cozy/registry-domain/registry-publish-contract";
import {
  LEGACY_REGISTRY_COMPONENT_TYPE,
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@cozy/registry-domain/registry-types";
import { parseTokensFromJson, tokensToRootCss } from "@cozy/tooling/theme-tokens";
import { analyzeUploadStyleHints } from "@cozy/tooling/upload-style-hints";
import {
  extractDependencies,
  validateComponentBundle,
  validateTsx,
} from "@cozy/tooling/validate-tsx";

type CreateRegistryItemBody = {
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
  provenance?: unknown;
  provenancePolicy?: unknown;
  applyStubInference?: unknown;
  publishScope?: "personal" | "team";
  targetRef?: string | null;
  organizationSlug?: string | null;
  teamSlug?: string | null;
  teamId?: string | null;
};

export async function createRegistryItemFromBody(input: {
  body: CreateRegistryItemBody;
  context: PlatformRequestContext;
}) {
  const { body, context } = input;
  const { name, type, title, description, content, files, visibility } = body;
  const hasFiles =
    files &&
    typeof files === "object" &&
    !Array.isArray(files) &&
    Object.keys(files as Record<string, unknown>).length > 0;

  const normalizedType =
    typeof type === "string" ? normalizeRegistryItemType(type) : "";

  if (!name || !normalizedType || !title || (!hasFiles && !content)) {
    return {
      status: 400,
      body: {
        error: "Missing required fields: name, type, title, and (files or content)",
      },
    };
  }

  if (Object.prototype.hasOwnProperty.call(body, "registryDependencies")) {
    const normalizedDeps = normalizeRegistryDependenciesInput(body.registryDependencies);
    if (normalizedDeps.error) {
      return {
        status: 400,
        body: { error: normalizedDeps.error, code: "REGDEP_INVALID_FORMAT" },
      };
    }
  }

  const userId = context.userId;
  if (!userId) {
    return {
      status: 401,
      body: {
        error:
          "Authentication required. Sign in or provide Authorization: Bearer <token>",
      },
    };
  }

  const resolvedPublishTarget = await resolvePublishTargetForUser({
    userId,
    publishScope: body.publishScope === "team" ? "team" : "personal",
    targetRef: typeof body.targetRef === "string" ? body.targetRef : null,
    organizationSlug:
      typeof body.organizationSlug === "string" ? body.organizationSlug : null,
    teamSlug: typeof body.teamSlug === "string" ? body.teamSlug : null,
    teamId: typeof body.teamId === "string" ? body.teamId : null,
    activeTeamId: context.activeTeamId,
  });

  if (!resolvedPublishTarget.ok) {
    const status =
      resolvedPublishTarget.code === "AMBIGUOUS_TEAM_TARGET"
        ? 400
        : resolvedPublishTarget.code === "NO_TEAM_WRITE_ACCESS"
          ? 403
          : 400;
    return {
      status,
      body: {
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
    };
  }

  const publishTarget = resolvedPublishTarget.target;
  const teamTarget = publishTarget.kind === "team" ? publishTarget : null;
  const isTheme = normalizedType === REGISTRY_THEME_TYPE;

  if (!hasFiles) {
    if (!isTheme) {
      const validation = validateTsx(content as string);
      if (!validation.valid) {
        return {
          status: 400,
          body: { error: `Invalid TSX: ${validation.error}` },
        };
      }
    } else if (typeof content !== "string" || content.trim().length === 0) {
      return {
        status: 400,
        body: { error: "Theme content is required (either CSS or tokens JSON)" },
      };
    }
  }

  const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!nameRegex.test(name)) {
    return {
      status: 400,
      body: { error: "Name must be kebab-case (e.g. my-component)" },
    };
  }

  const validTypes = [REGISTRY_BLOCK_TYPE, REGISTRY_UI_TYPE, REGISTRY_THEME_TYPE] as const;
  if (!validTypes.includes(normalizedType as (typeof validTypes)[number])) {
    return {
      status: 400,
      body: {
        error:
          `Type must be ${REGISTRY_BLOCK_TYPE}, ${REGISTRY_UI_TYPE}, or ${REGISTRY_THEME_TYPE}. ` +
          `${LEGACY_REGISTRY_COMPONENT_TYPE} is accepted as a legacy alias.`,
      },
    };
  }

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
        return {
          status: 400,
          body: { error: "Failed to derive CSS from tokens.json (no tokens found)" },
        };
      }
      normalizedFiles = {
        "theme.css": css,
        "tokens.json": tokensJson,
      };
      normalizedContent = undefined;
    }
  }

  const validVisibility = visibility === "private" ? "private" : "public";
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
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, value as string]),
    ) as Record<string, string>;
  }

  const hints = analyzeUploadStyleHints({
    itemType: normalizedType,
    files: normalizedFiles ?? undefined,
    content: normalizedFiles ? null : normalizedContent,
  });

  const contract = normalizePublishContract({
    mode: "create",
    input: body,
    files: normalizedFiles,
  });
  if (!contract.ok) {
    return {
      status: 400,
      body: { error: contract.error, code: contract.code },
    };
  }

  if (!isTheme && normalizedFiles && Object.keys(normalizedFiles).length > 0) {
    const toValidate = contract.value.filesToWrite ?? normalizedFiles;
    const validation = validateComponentBundle(toValidate);
    if (!validation.valid) {
      const details =
        validation.invalidFiles?.length
          ? validation.invalidFiles.slice(0, 10).join("\n")
          : validation.missingImports?.slice(0, 20).join("\n");
      return {
        status: 400,
        body: {
          error: details
            ? `${validation.error}:\n${details}`
            : validation.error ?? "Invalid component bundle",
        },
      };
    }
  }

  const filesToWrite = contract.value.filesToWrite ?? normalizedFiles;
  const depsToWrite = contract.value.registryDependenciesToWrite ?? [];

  try {
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

    return {
      status: 200,
      body: {
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
          appliedRegistryDependencies:
            contract.value.appliedRegistryDependencies ?? depsToWrite,
          droppedPaths: contract.value.diagnostics.droppedPaths,
          dirtyDependencyPaths: contract.value.diagnostics.dirtyDependencyPaths,
          stubInferredRegistryDependencies:
            contract.value.diagnostics.stubInferredRegistryDependencies,
          stubInferenceMergedIntoWrite:
            contract.value.diagnostics.stubInferenceMergedIntoWrite,
          policyApplied: contract.value.diagnostics.policyApplied,
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create";
    if (message.includes("unique") || message.includes("duplicate")) {
      return {
        status: 409,
        body: { error: "A component with this name already exists" },
      };
    }
    return {
      status: 500,
      body: { error: message },
    };
  }
}
