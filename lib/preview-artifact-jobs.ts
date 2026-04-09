import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  registryFileVersions,
  registryItems,
  registryItemVersions,
  registryAssetJobs,
  registryPreviewArtifacts,
} from "@/lib/db/schema";
import { sha256, stableStringify } from "@/lib/preview-build-cache";
import {
  toShadcnRegistryItem,
} from "@/lib/registry";
import { extractDependencies } from "@/lib/validate-tsx";
import { buildPreviewBundle } from "@/lib/preview-build";
import {
  type DependencyDecision,
  evaluateThirdPartyDependencies,
  excludeExplicitRegistryDependencies,
  getDependencyProviderMode,
  getCompatibleArtifactDependencyDisplayNames,
  getDependencyDisplayName,
  getRejectedDependencyDecisions,
  getRuntimePreviewDependencies,
  readDeclaredThirdPartyDependenciesFromMeta,
} from "@/lib/third-party-dependency-governance";
import {
  buildRegistryPreviewArtifactPath,
  uploadPublicAsset,
} from "@/lib/storage";
import {
  getPreviewDefaultStoryIdFromMeta,
  getPreviewStoriesFromMeta,
  pickPreviewStory,
} from "@/lib/preview-stories";
import {
  collectThemeCssFromResolvedGraph,
  createRegistryResolverMemo,
  resolveRegistryDependencies,
} from "@/lib/registry-resolver";
import { resolvePreviewDependencies } from "@/lib/preview-dependency-provider";
import { isBarePackageSpecifier } from "@/lib/module-specifiers";
import { buildMultiStoryPreviewHtml } from "@/lib/multi-story-preview-html";
import { buildArtifactPreviewHtml } from "@/lib/preview-artifact-html";
import { resolveCompatibleExternalDelivery } from "@/lib/preview-compatible-delivery";
import { maybeMaterializeCompatibleBundles } from "@/lib/compatible-bundle-materializer";
import {
  mergeRegistryDependenciesWithResolvedThemes,
  resolveThemeRelationshipForResource,
} from "@/lib/project-resource-relationships";

/** 公开存储路径按 artifactKey 固定为 preview.js，长期 Cache-Control 会留下陈旧内容；用内容哈希 bust 浏览器/CDN。 */
function publicAssetUrlWithContentBust(url: string, body: string): string {
  const id = sha256(body).replace(/^sha256:/, "").slice(0, 16);
  return `${url}${url.includes("?") ? "&" : "?"}v=${id}`;
}

export const BUILD_PREVIEW_ARTIFACT_JOB = "build_preview_artifact" as const;
export const PREVIEW_ARTIFACT_CAPABILITIES = [
  "managed-artifact",
  "compatible-artifact",
  "runtime-only",
] as const;
export type PreviewArtifactCapability =
  (typeof PREVIEW_ARTIFACT_CAPABILITIES)[number];

type PreviewArtifactJobPayload = {
  owner: string;
  project?: string | null;
  name: string;
  version: string;
  mode: "default" | "thumbnail";
  storyId?: string | null;
  requestUserId: string | null;
  artifactKey?: string;
};

export function buildPreviewArtifactKey(input: {
  itemId: string;
  itemVersionId: string;
  owner: string;
  project?: string | null;
  name: string;
  version: string;
  mode: "default" | "thumbnail";
  storyId?: string | null;
}) {
  return sha256(stableStringify(input));
}

export function formatRuntimeOnlyDependencySkipMessage(
  dependencyDecisions: DependencyDecision[],
) {
  const runtimeOnlyDependencies = dependencyDecisions
    .filter(
      (decision) =>
        decision.previewCapability === "runtime-only" &&
        decision.tier !== "runtime-provided" &&
        isBarePackageSpecifier(decision.packageName),
    )
    .map((decision) => getDependencyDisplayName(decision))
    .sort();

  if (runtimeOnlyDependencies.length === 0) {
    return "Artifact prebundle was skipped by policy because one or more dependencies are runtime-only.";
  }

  return `Artifact prebundle was skipped by policy because these dependencies are runtime-only: ${runtimeOnlyDependencies.join(", ")}.`;
}

function hasNonPlatformRuntimeOnlyDependencies(
  dependencyDecisions: DependencyDecision[],
) {
  return dependencyDecisions.some(
    (decision) =>
      decision.previewCapability === "runtime-only" &&
      decision.tier !== "runtime-provided" &&
      isBarePackageSpecifier(decision.packageName),
  );
}

function hasCompatibleExternalDependencies(
  dependencyDecisions: DependencyDecision[],
) {
  return dependencyDecisions.some(
    (decision) =>
      getDependencyProviderMode(decision) === "compatible-external" &&
      decision.previewCapability === "compatible-artifact-supported" &&
      isBarePackageSpecifier(decision.packageName),
  );
}

export function normalizePreviewArtifactCapability(
  value: unknown,
): PreviewArtifactCapability | null {
  return PREVIEW_ARTIFACT_CAPABILITIES.includes(
    value as PreviewArtifactCapability,
  )
    ? (value as PreviewArtifactCapability)
    : null;
}

export function classifyPreviewArtifactCapability(
  dependencyDecisions: DependencyDecision[],
): PreviewArtifactCapability {
  const hasRuntimeOnly = hasNonPlatformRuntimeOnlyDependencies(dependencyDecisions);
  const hasCompatible = hasCompatibleExternalDependencies(dependencyDecisions);

  if (hasRuntimeOnly && !hasCompatible) {
    return "runtime-only";
  }
  if (hasCompatible) {
    return "compatible-artifact";
  }
  return "managed-artifact";
}

export function inferPreviewArtifactCapability(input: {
  storedCapability?: unknown;
  artifactStatus?: unknown;
  dependencyDecisions: DependencyDecision[];
}): PreviewArtifactCapability {
  const stored = normalizePreviewArtifactCapability(input.storedCapability);
  if (stored) return stored;
  if (input.artifactStatus === "skipped") {
    return "runtime-only";
  }
  return classifyPreviewArtifactCapability(input.dependencyDecisions);
}

export async function enqueuePreviewArtifactJob(params: {
  itemId: string;
  itemVersionId: string;
  payload: PreviewArtifactJobPayload;
}) {
  const normalizedStoryId = params.payload.storyId?.trim() || "";
  const artifactKey = buildPreviewArtifactKey({
    itemId: params.itemId,
    itemVersionId: params.itemVersionId,
      owner: params.payload.owner,
      project: params.payload.project?.trim() || null,
      name: params.payload.name,
      version: params.payload.version,
    mode: params.payload.mode,
    storyId: normalizedStoryId,
  });

  const [artifact] = await db
    .insert(registryPreviewArtifacts)
    .values({
      itemId: params.itemId,
      itemVersionId: params.itemVersionId,
      mode: params.payload.mode,
      storyId: normalizedStoryId,
      status: "queued",
      artifactCapability: "managed-artifact",
      artifactKey,
      lastErrorCode: null,
      lastErrorMessage: null,
      startedAt: null,
      finishedAt: null,
    })
    .onConflictDoUpdate({
      target: [
        registryPreviewArtifacts.itemVersionId,
        registryPreviewArtifacts.mode,
        registryPreviewArtifacts.storyId,
      ],
      set: {
        status: "queued",
        artifactCapability: "managed-artifact",
        artifactKey,
        lastErrorCode: null,
        lastErrorMessage: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [existingPendingJob] = await db
    .select({ id: registryAssetJobs.id })
    .from(registryAssetJobs)
    .where(
      and(
        eq(registryAssetJobs.jobType, BUILD_PREVIEW_ARTIFACT_JOB),
        sql`${registryAssetJobs.payload} ->> 'artifactKey' = ${artifactKey}`,
        eq(registryAssetJobs.status, "pending"),
      ),
    )
    .limit(1);
  if (existingPendingJob) {
    return { artifact, job: existingPendingJob, artifactKey };
  }

  const [existingProcessingJob] = await db
    .select({ id: registryAssetJobs.id })
    .from(registryAssetJobs)
    .where(
      and(
        eq(registryAssetJobs.jobType, BUILD_PREVIEW_ARTIFACT_JOB),
        sql`${registryAssetJobs.payload} ->> 'artifactKey' = ${artifactKey}`,
        eq(registryAssetJobs.status, "processing"),
      ),
    )
    .limit(1);
  if (existingProcessingJob) {
    return { artifact, job: existingProcessingJob, artifactKey };
  }

  const [job] = await db
    .insert(registryAssetJobs)
    .values({
      jobType: BUILD_PREVIEW_ARTIFACT_JOB,
      itemId: params.itemId,
      itemVersionId: params.itemVersionId,
      status: "pending",
      payload: {
        ...params.payload,
        artifactKey,
      },
    })
    .returning();

  return { artifact, job, artifactKey };
}

export function buildWarmPreviewArtifactTargets(meta: unknown): Array<{
  mode: "default" | "thumbnail";
  storyId: string | null;
}> {
  const stories = getPreviewStoriesFromMeta(meta);
  const defaultStoryId =
    getPreviewDefaultStoryIdFromMeta(meta) ?? stories[0]?.id ?? null;

  const targets = new Map<string, { mode: "default" | "thumbnail"; storyId: string | null }>();
  const addTarget = (mode: "default" | "thumbnail", storyId: string | null) => {
    const normalizedStoryId = storyId?.trim() || null;
    const key = `${mode}:${normalizedStoryId ?? ""}`;
    targets.set(key, { mode, storyId: normalizedStoryId });
  };

  addTarget("default", defaultStoryId);
  addTarget("thumbnail", defaultStoryId);

  for (const story of stories) {
    addTarget("default", story.id);
  }

  return Array.from(targets.values());
}

export async function enqueueWarmPreviewArtifacts(params: {
  itemId: string;
  itemVersionId: string;
  owner: string;
  project?: string | null;
  name: string;
  version: string;
  requestUserId: string | null;
  meta: unknown;
}) {
  const targets = buildWarmPreviewArtifactTargets(params.meta);
  await Promise.all(
    targets.map((target) =>
      enqueuePreviewArtifactJob({
        itemId: params.itemId,
        itemVersionId: params.itemVersionId,
        payload: {
          owner: params.owner,
          project: params.project ?? null,
          name: params.name,
          version: params.version,
          mode: target.mode,
          storyId: target.storyId,
          requestUserId: params.requestUserId,
        },
      }),
    ),
  );
}

export async function getPreviewArtifactStatus(params: {
  itemVersionId: string;
  mode?: "default" | "thumbnail";
  storyId?: string | null;
}) {
  const mode = params.mode ?? "default";
  const normalizedStoryId = params.storyId?.trim() || "";
  const [row] = await db
    .select()
    .from(registryPreviewArtifacts)
    .where(
      and(
        eq(registryPreviewArtifacts.itemVersionId, params.itemVersionId),
        eq(registryPreviewArtifacts.mode, mode),
        eq(registryPreviewArtifacts.storyId, normalizedStoryId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Single joined query for the fast path: items → versions → artifacts.
 * Bypasses the multi-query item loader when we only need the artifact HTML.
 * Returns null if no matching artifact exists or the item isn't accessible.
 */
export async function lookupPreviewArtifactFast(params: {
  ownerUserId?: string | null;
  organizationId?: string | null;
  requestUserId?: string | null;
  name: string;
  projectKey?: string | null;
  version: string | null;
  mode: "default" | "thumbnail";
  storyId: string;
}) {
  const ownerConditions = [];
  if (params.ownerUserId) {
    ownerConditions.push(eq(registryItems.userId, params.ownerUserId));
  }
  if (params.organizationId) {
    ownerConditions.push(eq(registryItems.organizationId, params.organizationId));
  }
  if (ownerConditions.length === 0) return null;

  const ownerFilter =
    ownerConditions.length === 1 ? ownerConditions[0] : or(...ownerConditions);

  const projectFilter = params.projectKey
    ? eq(registryItems.canonicalProjectKey, params.projectKey)
    : undefined;

  const versionFilter = params.version
    ? eq(registryItemVersions.version, params.version)
    : eq(registryItemVersions.version, sql`COALESCE(${registryItems.currentVersion}, '0.1.0')`);

  const ACTIVE_STATUS = "active";

  const [row] = await db
    .select({
      htmlUrl: registryPreviewArtifacts.htmlUrl,
      htmlContent: registryPreviewArtifacts.htmlContent,
      status: registryPreviewArtifacts.status,
      artifactCapability: registryPreviewArtifacts.artifactCapability,
      itemType: registryItems.type,
      itemVisibility: registryItems.visibility,
      itemStatus: registryItems.status,
      itemUserId: registryItems.userId,
      itemOrganizationId: registryItems.organizationId,
    })
    .from(registryPreviewArtifacts)
    .innerJoin(
      registryItemVersions,
      eq(registryPreviewArtifacts.itemVersionId, registryItemVersions.id),
    )
    .innerJoin(
      registryItems,
      eq(registryItemVersions.itemId, registryItems.id),
    )
    .where(
      and(
        ownerFilter,
        eq(registryItems.name, params.name),
        eq(registryItems.status, ACTIVE_STATUS),
        projectFilter,
        versionFilter,
        eq(registryPreviewArtifacts.mode, params.mode),
        eq(registryPreviewArtifacts.storyId, params.storyId),
      ),
    )
    .limit(1);

  if (!row) return null;

  if (row.itemVisibility === "private") {
    if (!params.requestUserId) return null;
    const isOwner = row.itemUserId === params.requestUserId;
    if (!isOwner && row.itemOrganizationId) {
      const { isUserOrganizationMember } = await import("@/lib/registry-organization");
      if (!(await isUserOrganizationMember(params.requestUserId, row.itemOrganizationId))) {
        return null;
      }
    } else if (!isOwner) {
      return null;
    }
  }

  return row;
}

export async function claimPendingPreviewArtifactJob() {
  const [pending] = await db
    .select()
    .from(registryAssetJobs)
    .where(
      and(
        eq(registryAssetJobs.jobType, BUILD_PREVIEW_ARTIFACT_JOB),
        eq(registryAssetJobs.status, "pending"),
      ),
    )
    .orderBy(asc(registryAssetJobs.createdAt))
    .limit(1);

  if (!pending) return null;

  const [claimed] = await db
    .update(registryAssetJobs)
    .set({
      status: "processing",
      attemptCount: pending.attemptCount + 1,
      startedAt: new Date(),
      lastError: null,
    })
    .where(eq(registryAssetJobs.id, pending.id))
    .returning();

  return claimed ?? null;
}

export async function completePreviewArtifactJob(jobId: string) {
  await db
    .update(registryAssetJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      lastError: null,
    })
    .where(eq(registryAssetJobs.id, jobId));
}

export async function failPreviewArtifactJob(jobId: string, error: string) {
  await db
    .update(registryAssetJobs)
    .set({
      status: "failed",
      lastError: error,
      completedAt: new Date(),
    })
    .where(eq(registryAssetJobs.id, jobId));
}

export async function processPreviewArtifactJob(jobId: string) {
  const [job] = await db
    .select()
    .from(registryAssetJobs)
    .where(eq(registryAssetJobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error(`Preview artifact job not found: ${jobId}`);
  }
  if (job.jobType !== BUILD_PREVIEW_ARTIFACT_JOB) {
    throw new Error(`Invalid preview artifact job type: ${job.jobType}`);
  }

  const payload = (job.payload ?? {}) as PreviewArtifactJobPayload;
  const normalizedStoryId = payload.storyId?.trim() || "";
  const normalizedProjectKey = payload.project?.trim() || null;
  const mode = payload.mode === "thumbnail" ? "thumbnail" : "default";
  const artifactKey =
    typeof payload.artifactKey === "string" && payload.artifactKey.trim().length > 0
      ? payload.artifactKey
      : buildPreviewArtifactKey({
          itemId: job.itemId,
          itemVersionId: job.itemVersionId ?? "",
          owner: payload.owner,
          project: normalizedProjectKey,
          name: payload.name,
          version: payload.version,
          mode,
          storyId: normalizedStoryId,
        });
  let artifactCapability: PreviewArtifactCapability = "managed-artifact";

  await db
    .update(registryPreviewArtifacts)
    .set({
      status: "running",
      artifactCapability: "managed-artifact",
      startedAt: new Date(),
      finishedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    .where(eq(registryPreviewArtifacts.artifactKey, artifactKey));

  try {
    const item = await loadPreviewArtifactJobItemSnapshot(
      job.itemId,
      job.itemVersionId ?? null,
    );
    if (!item) {
      throw new Error(
        `Registry item not found: @${
          normalizedProjectKey
            ? `${payload.owner}/${normalizedProjectKey}/${payload.name}`
            : `${payload.owner}/${payload.name}`
        }@${payload.version}`,
      );
    }

    const shadcnItem = toShadcnRegistryItem(item);
    if (!shadcnItem) {
      throw new Error("Failed to convert registry item to shadcn format");
    }

    const files: Record<string, string> = {};
    for (const f of shadcnItem.files ?? []) {
      files[f.path] = f.content;
    }

    const itemMeta =
      item.meta && typeof item.meta === "object"
        ? (item.meta as Record<string, unknown>)
        : undefined;
    const rawPreviewProps = itemMeta?.previewProps;
    const fallbackPreviewProps =
      rawPreviewProps === undefined || rawPreviewProps === null ? {} : rawPreviewProps;
    const rawPreviewExport = itemMeta?.previewExport;
    const fallbackPreviewExport =
      typeof rawPreviewExport === "string" && rawPreviewExport.trim().length > 0
        ? rawPreviewExport.trim()
        : undefined;
    const { selectedStory } = pickPreviewStory(itemMeta, normalizedStoryId || null);
    const previewProps = selectedStory?.props ?? fallbackPreviewProps;
    const previewExport = selectedStory?.export ?? fallbackPreviewExport;

    const runtimeDeps = Array.from(
      new Set([
        ...((item.dependencies ?? []) as string[]),
        ...Object.values(files).flatMap((src) => extractDependencies(src)),
      ]),
    )
      .filter(
        (spec) => !!spec && isBarePackageSpecifier(spec),
      )
      .sort();
    const dependencyDecisions = evaluateThirdPartyDependencies({
      discovered: excludeExplicitRegistryDependencies(
        runtimeDeps,
        (item.registryDependencies ?? []) as string[],
      ),
      declared: readDeclaredThirdPartyDependenciesFromMeta(itemMeta),
    });
    const rejectedDependencies = getRejectedDependencyDecisions(
      dependencyDecisions,
    );
    if (rejectedDependencies.length > 0) {
      const details = rejectedDependencies
        .map((decision) => `${getDependencyDisplayName(decision)}: ${decision.message}`)
        .join("; ");
      throw new Error(`Rejected preview dependencies: ${details}`);
    }
    artifactCapability =
      classifyPreviewArtifactCapability(dependencyDecisions);

    await db
      .update(registryPreviewArtifacts)
      .set({
        artifactCapability,
      })
      .where(eq(registryPreviewArtifacts.artifactKey, artifactKey));

    if (artifactCapability === "runtime-only") {
      const reasonCode = "SKIPPED_RUNTIME_ONLY_DEPENDENCIES";
      const message =
        formatRuntimeOnlyDependencySkipMessage(dependencyDecisions);

      await db
        .update(registryPreviewArtifacts)
        .set({
          status: "skipped",
          artifactCapability,
          finishedAt: new Date(),
          lastErrorCode: reasonCode,
          lastErrorMessage: message,
          jsUrl: null,
          cssUrl: null,
          manifestUrl: null,
        })
        .where(eq(registryPreviewArtifacts.artifactKey, artifactKey));

      await completePreviewArtifactJob(jobId);
      return {
        ok: true as const,
        artifactKey,
        skipped: true as const,
        reasonCode,
      };
    }
    const resolvedPreviewDependencies = await resolvePreviewDependencies({
      decisions: dependencyDecisions,
    });

    const canFullyBundle = artifactCapability === "managed-artifact";

    const buildResult = await buildPreviewBundle(
      {
        name: payload.name,
        version: payload.version,
        files,
        dependencies:
          artifactCapability === "compatible-artifact"
            ? getCompatibleArtifactDependencyDisplayNames(dependencyDecisions)
            : getRuntimePreviewDependencies(dependencyDecisions),
        previewExport,
      },
      previewProps,
      {
        mode,
        debug: false,
        externalizeDependencies: !canFullyBundle,
        dependencyNodePaths: resolvedPreviewDependencies.nodePaths,
        dependencyResolutionDiagnostics:
          resolvedPreviewDependencies.diagnostics,
        bundleReact: canFullyBundle,
      },
    );

    if (!buildResult.ok) {
      const err = buildResult.error;
      const details =
        err.file && err.line != null
          ? ` (${err.file}:${err.line}:${err.column ?? 0})`
          : "";
      throw new Error(`${err.message}${details}`);
    }

    const jsPath = buildRegistryPreviewArtifactPath({
      owner: payload.owner,
      project: normalizedProjectKey,
      itemName: payload.name,
      version: payload.version,
      mode,
      artifactKey,
      filename: "preview.js",
    });
    const uploadedJs = await uploadPublicAsset({
      path: jsPath,
      body: buildResult.code,
      contentType: "application/javascript; charset=utf-8",
      cacheControl: "31536000",
      assetType: "preview-artifact",
    });
    const jsUrlForClients = publicAssetUrlWithContentBust(
      uploadedJs.url,
      buildResult.code,
    );

    let uploadedCssUrl: string | null = null;
    if (buildResult.css && buildResult.css.trim().length > 0) {
      const cssPath = buildRegistryPreviewArtifactPath({
        owner: payload.owner,
        project: normalizedProjectKey,
        itemName: payload.name,
        version: payload.version,
        mode,
        artifactKey,
        filename: "preview.css",
      });
      const uploadedCss = await uploadPublicAsset({
        path: cssPath,
        body: buildResult.css,
        contentType: "text/css; charset=utf-8",
        cacheControl: "31536000",
        assetType: "preview-artifact",
      });
      uploadedCssUrl = publicAssetUrlWithContentBust(
        uploadedCss.url,
        buildResult.css,
      );
    }

    const storiesHtml = await buildMultiStoryPreviewHtml({
      owner: payload.owner,
      name: payload.name,
      title: item.title,
      description: item.description,
      project: normalizedProjectKey,
      version: payload.version,
      stories: getPreviewStoriesFromMeta(itemMeta),
      files: shadcnItem.files ?? [],
    });
    const storiesHtmlPath = buildRegistryPreviewArtifactPath({
      owner: payload.owner,
      project: normalizedProjectKey,
      itemName: payload.name,
      version: payload.version,
      mode,
      artifactKey,
      filename: "stories.html",
    });
    const uploadedStoriesHtml = await uploadPublicAsset({
      path: storiesHtmlPath,
      body: storiesHtml,
      contentType: "text/html; charset=utf-8",
      cacheControl: "31536000",
      assetType: "preview-artifact",
    });
    const storiesHtmlUrlForClients = publicAssetUrlWithContentBust(
      uploadedStoriesHtml.url,
      storiesHtml,
    );

    const resolvedCompatibleExternals =
      resolvedPreviewDependencies.plan.compatibleExternals.map((entry) =>
        resolveCompatibleExternalDelivery({
          packageName: entry.packageName,
          requestedVersion: entry.requestedVersion,
          importMapTarget: entry.importMapTarget,
          isDev: mode === "default" && !canFullyBundle,
        }),
      );
    const compatibleExternalsForArtifact =
      await maybeMaterializeCompatibleBundles({
        entries: resolvedCompatibleExternals,
        upload: true,
      });
    const projectKeyForRelationships = normalizedProjectKey ?? item.canonicalProjectKey ?? null;
    const resolvedThemeRelationship =
      item.type === "registry:theme"
        ? {
            resolvedThemeResourceRefs: [],
            resolvedThemeLayerSources: [],
          }
        : await resolveThemeRelationshipForResource({
            owner: payload.owner,
            projectKey: projectKeyForRelationships,
            meta: item.meta,
            requestUserId: payload.requestUserId,
          });
    const effectiveRegistryDependencies = mergeRegistryDependenciesWithResolvedThemes(
      (item.registryDependencies ?? []) as string[],
      resolvedThemeRelationship.resolvedThemeResourceRefs,
    );
    let resolvedThemeCss = "";
    let themeSources: string[] = [];
    if (effectiveRegistryDependencies.length > 0 && item.type !== "registry:theme") {
      const resolvedGraph = await resolveRegistryDependencies({
        owner: payload.owner,
        projectKey: projectKeyForRelationships,
        name: payload.name,
        version: payload.version,
        requestUserId: payload.requestUserId,
        memo: createRegistryResolverMemo(),
        extraRootRegistryDependencies: effectiveRegistryDependencies,
      });
      const resolvedTheme = collectThemeCssFromResolvedGraph(
        resolvedGraph.ordered,
      );
      resolvedThemeCss = resolvedTheme.css;
      themeSources = resolvedTheme.sources;
    }
    const dependencyPlan = {
      ...resolvedPreviewDependencies.plan,
      compatibleExternals: compatibleExternalsForArtifact,
    };

    const manifest = {
      schemaVersion: 1,
      owner: payload.owner,
      name: payload.name,
      version: payload.version,
      mode,
      storyId: normalizedStoryId,
      artifactKey,
      generatedAt: new Date().toISOString(),
      jsUrl: jsUrlForClients,
      cssUrl: uploadedCssUrl,
      storiesHtmlUrl: storiesHtmlUrlForClients,
      hostFallbackUsed: dependencyPlan.hostFallbackUsed,
      managedProviderDependencies: dependencyPlan.managedPackages
        .filter((entry) => entry.resolutionSource === "provider")
        .map((entry) => entry.packageName),
      compatibleBundledDependencies: compatibleExternalsForArtifact
        .filter((entry) => entry.deliveryMode === "compatible-bundled")
        .map((entry) => entry.packageName),
      resolvedThemeResourceRefs:
        resolvedThemeRelationship.resolvedThemeResourceRefs,
      resolvedThemeLayerSources:
        resolvedThemeRelationship.resolvedThemeLayerSources,
      resolvedThemeResourceRef:
        resolvedThemeRelationship.resolvedThemeResourceRefs[0] ?? null,
      resolvedThemeSource:
        resolvedThemeRelationship.resolvedThemeLayerSources[0] === "resource-layer"
          ? "resource-override"
          : resolvedThemeRelationship.resolvedThemeLayerSources[0] ?? "none",
      themeSources,
      dependencyPlan,
      dependencyResolutionDiagnostics:
        buildResult.dependencyResolutionDiagnostics ?? [],
    };
    const manifestPath = buildRegistryPreviewArtifactPath({
      owner: payload.owner,
      project: normalizedProjectKey,
      itemName: payload.name,
      version: payload.version,
      mode,
      artifactKey,
      filename: "manifest.json",
    });
    const uploadedManifest = await uploadPublicAsset({
      path: manifestPath,
      body: JSON.stringify(manifest, null, 2),
      contentType: "application/json; charset=utf-8",
      cacheControl: "31536000",
      assetType: "preview-artifact",
    });

    const previewHtml = buildArtifactPreviewHtml({
      jsUrl: jsUrlForClients,
      cssUrl: uploadedCssUrl,
      themeCss: resolvedThemeCss,
      compatibleExternals: compatibleExternalsForArtifact,
      mode,
      bundledReact: canFullyBundle,
    });
    const htmlPath = buildRegistryPreviewArtifactPath({
      owner: payload.owner,
      project: normalizedProjectKey,
      itemName: payload.name,
      version: payload.version,
      mode,
      artifactKey,
      filename: "preview.html",
    });
    const uploadedHtml = await uploadPublicAsset({
      path: htmlPath,
      body: previewHtml,
      contentType: "text/html; charset=utf-8",
      cacheControl: "31536000",
      assetType: "preview-artifact",
    });
    const htmlUrlForClients = publicAssetUrlWithContentBust(
      uploadedHtml.url,
      previewHtml,
    );

    await db
      .update(registryPreviewArtifacts)
      .set({
        status: "ready",
        artifactCapability,
        jsUrl: jsUrlForClients,
        cssUrl: uploadedCssUrl,
        manifestUrl: uploadedManifest.url,
        htmlUrl: htmlUrlForClients,
        htmlContent: previewHtml,
        finishedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(eq(registryPreviewArtifacts.artifactKey, artifactKey));

    await completePreviewArtifactJob(jobId);
    return {
      ok: true as const,
      artifactKey,
      jsUrl: jsUrlForClients,
      cssUrl: uploadedCssUrl,
      manifestUrl: uploadedManifest.url,
      htmlUrl: htmlUrlForClients,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown preview artifact build error";

    await db
      .update(registryPreviewArtifacts)
      .set({
        status: "failed",
        artifactCapability,
        finishedAt: new Date(),
        lastErrorCode: "PREVIEW_ARTIFACT_BUILD_FAILED",
        lastErrorMessage: message,
      })
      .where(eq(registryPreviewArtifacts.artifactKey, artifactKey));

    await failPreviewArtifactJob(jobId, message);
    throw error;
  }
}

async function loadPreviewArtifactJobItemSnapshot(
  itemId: string,
  itemVersionId: string | null,
) {
  if (!itemVersionId) return null;

  const [base] = await db
    .select()
    .from(registryItems)
    .where(eq(registryItems.id, itemId))
    .limit(1);
  if (!base) return null;

  const [itemVersion] = await db
    .select()
    .from(registryItemVersions)
    .where(
      and(
        eq(registryItemVersions.id, itemVersionId),
        eq(registryItemVersions.itemId, itemId),
      ),
    )
    .limit(1);
  if (!itemVersion) return null;

  const fileVersions = await db
    .select()
    .from(registryFileVersions)
    .where(eq(registryFileVersions.itemVersionId, itemVersionId));

  return {
    ...base,
    title: itemVersion.title,
    description: itemVersion.description,
    dependencies: itemVersion.dependencies,
    registryDependencies: itemVersion.registryDependencies,
    meta: itemVersion.meta ?? base.meta,
    files: fileVersions.map((f) => ({
      path: f.path,
      content: f.content,
      type: f.type,
    })),
  };
}
