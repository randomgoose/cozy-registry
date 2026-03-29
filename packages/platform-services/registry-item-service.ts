import {
  createRegistryItemVersion,
  deleteRegistryItem,
  deleteTeamRegistryItem,
  getCurrentVersion,
  getRegistryItemByOwnerAndName,
  getRegistryItemByOwnerNameAndVersion,
  getRegistryItemVersions,
  updateRegistryItemVisibility,
  updateTeamRegistryItemVisibility,
} from "@cozy/registry-domain/registry";
import type {
  PlatformRequestContext,
  PlatformSessionContext,
} from "@cozy/platform-core/platform-context";
import { resolveOwner } from "@cozy/registry-domain/owner";
import { getWritableTeamTargetForUser } from "@cozy/registry-domain/publish-target";
import { normalizePublishContract } from "@cozy/registry-domain/registry-publish-contract";
import {
  REGISTRY_THEME_TYPE,
  normalizeRegistryItemType,
} from "@cozy/registry-domain/registry-types";
import {
  parseTeamOwnerPath,
  resolveTeamByOrgSlugAndTeamSegment,
} from "@cozy/auth-control/registry-team";
import { parseTokensFromJson, tokensToRootCss } from "@cozy/tooling/theme-tokens";
import { analyzeUploadStyleHints } from "@cozy/tooling/upload-style-hints";
import { validateComponentBundle, validateTsx } from "@cozy/tooling/validate-tsx";

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
};

export async function getRegistryItemMetadata(input: {
  owner: string;
  name: string;
  session: Pick<PlatformSessionContext, "userId">;
}) {
  const requestUserId = input.session.userId;
  const teamPath = parseTeamOwnerPath(input.owner);
  if (teamPath) {
    const item = await getRegistryItemByOwnerNameAndVersion(
      input.owner,
      input.name,
      null,
      requestUserId,
    );
    if (!item) return null;
    return {
      name: item.name,
      ownerUserId: item.userId ?? null,
      title: item.title,
      description: item.description,
      type: item.type,
      visibility: item.visibility,
    };
  }

  const resolved = await resolveOwner(input.owner);
  if (!resolved) return null;
  const item = await getRegistryItemByOwnerAndName(
    resolved.userId,
    input.name,
    requestUserId,
  );
  if (!item) return null;
  return {
    name: item.name,
    ownerUserId: item.userId ?? null,
    title: item.title,
    description: item.description,
    type: item.type,
    visibility: item.visibility,
  };
}

export async function deleteRegistryItemByOwner(input: {
  owner: string;
  name: string;
  context: Pick<PlatformRequestContext, "userId">;
}) {
  const userId = input.context.userId;
  if (!userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  try {
    const teamPath = parseTeamOwnerPath(input.owner);
    if (teamPath) {
      const resolvedTeam = await resolveTeamByOrgSlugAndTeamSegment(
        teamPath.orgSlug,
        teamPath.teamSegment,
      );
      if (!resolvedTeam) {
        return { status: 404, body: { error: "Not found" } };
      }
      await deleteTeamRegistryItem({
        teamId: resolvedTeam.teamId,
        name: input.name,
        requestUserId: userId,
        ownerRef: input.owner,
      });
      return { status: 200, body: { success: true } };
    }

    const resolved = await resolveOwner(input.owner);
    if (!resolved) {
      return { status: 404, body: { error: "Not found" } };
    }
    await deleteRegistryItem({
      ownerId: resolved.userId,
      name: input.name,
      requestUserId: userId,
      ownerRef: input.owner,
    });
    return { status: 200, body: { success: true } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    if (msg.includes("not found") || msg.includes("no access")) {
      return { status: 404, body: { error: msg } };
    }
    if (msg.includes("Only owner")) {
      return { status: 403, body: { error: msg } };
    }
    if (msg.includes("Cannot delete: still referenced")) {
      return {
        status: 409,
        body: { error: msg, code: "REGDEP_REFERENCED" },
      };
    }
    return { status: 500, body: { error: msg } };
  }
}

export async function updateRegistryItemVisibilityByOwner(input: {
  owner: string;
  name: string;
  visibility: "public" | "private";
  context: Pick<PlatformRequestContext, "userId">;
}) {
  const userId = input.context.userId;
  if (!userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  try {
    const teamPath = parseTeamOwnerPath(input.owner);
    if (teamPath) {
      const resolvedTeam = await resolveTeamByOrgSlugAndTeamSegment(
        teamPath.orgSlug,
        teamPath.teamSegment,
      );
      if (!resolvedTeam) {
        return { status: 404, body: { error: "Not found" } };
      }

      const updated = await updateTeamRegistryItemVisibility({
        teamId: resolvedTeam.teamId,
        name: input.name,
        requestUserId: userId,
        visibility: input.visibility,
      });

      return {
        status: 200,
        body: {
          success: true,
          visibility: updated.visibility,
          updatedAt: updated.updatedAt,
        },
      };
    }

    const resolved = await resolveOwner(input.owner);
    if (!resolved) {
      return { status: 404, body: { error: "Not found" } };
    }

    const updated = await updateRegistryItemVisibility({
      ownerId: resolved.userId,
      name: input.name,
      requestUserId: userId,
      visibility: input.visibility,
    });

    return {
      status: 200,
      body: {
        success: true,
        visibility: updated.visibility,
        updatedAt: updated.updatedAt,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    if (msg.includes("not found") || msg.includes("no access")) {
      return { status: 404, body: { error: msg } };
    }
    if (msg.includes("Only owner")) {
      return { status: 403, body: { error: msg } };
    }
    return { status: 500, body: { error: msg } };
  }
}

export async function getRegistryItemVersionSummary(input: {
  owner: string;
  name: string;
  session: Pick<PlatformSessionContext, "userId">;
}) {
  const userId = input.session.userId;
  const item = await getRegistryItemByOwnerNameAndVersion(
    input.owner,
    input.name,
    null,
    userId,
  );
  if (!item) return null;

  const versions = await getRegistryItemVersions(input.owner, input.name, userId);
  return {
    currentVersion: getCurrentVersion(item),
    versions: versions.map((v) => ({
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      message: v.message ?? null,
    })),
  };
}

export async function createRegistryItemVersionFromBody(input: {
  owner: string;
  name: string;
  body: VersionRequestBody;
  context: Pick<PlatformRequestContext, "userId">;
}) {
  const userId = input.context.userId;
  if (!userId) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const { content, files, bump, message } = input.body;
  const teamPath = parseTeamOwnerPath(input.owner);
  const resolvedTeam = teamPath
    ? await resolveTeamByOrgSlugAndTeamSegment(teamPath.orgSlug, teamPath.teamSegment)
    : null;
  const resolved = !resolvedTeam ? await resolveOwner(input.owner) : null;
  if (!resolvedTeam && !resolved) {
    return { status: 404, body: { error: "Not found" } };
  }

  const item = await getRegistryItemByOwnerNameAndVersion(
    input.owner,
    input.name,
    null,
    userId,
  );
  if (!item) {
    return { status: 404, body: { error: "Not found" } };
  }

  if (resolvedTeam) {
    const writableTeam = await getWritableTeamTargetForUser(userId, resolvedTeam.teamId);
    if (!writableTeam) {
      return {
        status: 403,
        body: { error: "You do not have publish access to the selected team." },
      };
    }
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
    return { status: 400, body: { error: "content or files is required" } };
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
        return {
          status: 400,
          body: { error: "Failed to derive CSS from tokens.json (no tokens found)" },
        };
      }
      finalFiles = {
        "theme.css": css,
        "tokens.json": maybeTokensJson,
      };
      finalContent = undefined;
    }
  }

  const contract = normalizePublishContract({
    mode: "version",
    input: input.body,
    files: finalFiles,
    previousRegistryDependencies: (item.registryDependencies ?? []) as string[],
  });
  if (!contract.ok) {
    return {
      status: 400,
      body: { error: contract.error, code: contract.code },
    };
  }

  if (finalFiles) {
    if (isTheme) {
      const hasThemePayload =
        Object.keys(finalFiles).length > 0 &&
        Object.values(finalFiles).some(
          (value) => typeof value === "string" && value.trim().length > 0,
        );
      if (!hasThemePayload) {
        return {
          status: 400,
          body: { error: "Theme files must include CSS or tokens content" },
        };
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
  } else if (finalContent) {
    if (isTheme) {
      if (finalContent.trim().length === 0) {
        return { status: 400, body: { error: "Theme content is required" } };
      }
    } else {
      const validation = validateTsx(finalContent);
      if (!validation.valid) {
        return {
          status: 400,
          body: { error: `Invalid TSX: ${validation.error}` },
        };
      }
    }
  }

  const bumpType = bump ?? "patch";
  if (!["patch", "minor", "major"].includes(bumpType)) {
    return {
      status: 400,
      body: { error: "bump must be patch, minor, or major" },
    };
  }

  try {
    const hints = analyzeUploadStyleHints({
      itemType: normalizedType,
      files: finalFiles ?? undefined,
      content: finalFiles ? null : finalContent,
    });
    const result = await createRegistryItemVersion({
      ownerId: resolved?.userId,
      teamId: resolvedTeam?.teamId,
      name: input.name,
      content: finalContent,
      files: contract.value.filesToWrite ?? finalFiles,
      bump: bumpType,
      userId,
      message: typeof message === "string" ? message : undefined,
      registryDependencies: contract.value.registryDependenciesToWrite,
      previewProps: contract.value.previewProps,
      previewExport: contract.value.previewExport,
    });
    return {
      status: 200,
      body: {
        version: result.version,
        hints,
        publishDiagnostics: {
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
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("not found") || msg.includes("no access")) {
      return { status: 404, body: { error: msg } };
    }
    if (msg.includes("Only owner")) {
      return { status: 403, body: { error: msg } };
    }
    return { status: 500, body: { error: msg } };
  }
}
