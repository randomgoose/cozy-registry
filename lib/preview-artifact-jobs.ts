import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  registryAssetJobs,
  registryPreviewArtifacts,
} from "@/lib/db/schema";
import { sha256, stableStringify } from "@/lib/preview-build-cache";
import {
  getRegistryItemByOwnerNameAndVersion,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { extractDependencies } from "@/lib/validate-tsx";
import { buildPreviewBundle } from "@/lib/preview-build";
import {
  buildRegistryPreviewArtifactPath,
  uploadPublicAsset,
} from "@/lib/storage";
import { pickPreviewStory } from "@/lib/preview-stories";

export const BUILD_PREVIEW_ARTIFACT_JOB = "build_preview_artifact" as const;

type PreviewArtifactJobPayload = {
  owner: string;
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
  name: string;
  version: string;
  mode: "default" | "thumbnail";
  storyId?: string | null;
}) {
  return sha256(stableStringify(input));
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
  const mode = payload.mode === "thumbnail" ? "thumbnail" : "default";
  const artifactKey =
    typeof payload.artifactKey === "string" && payload.artifactKey.trim().length > 0
      ? payload.artifactKey
      : buildPreviewArtifactKey({
          itemId: job.itemId,
          itemVersionId: job.itemVersionId ?? "",
          owner: payload.owner,
          name: payload.name,
          version: payload.version,
          mode,
          storyId: normalizedStoryId,
        });

  await db
    .update(registryPreviewArtifacts)
    .set({
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    .where(eq(registryPreviewArtifacts.artifactKey, artifactKey));

  try {
    const item = await getRegistryItemByOwnerNameAndVersion(
      payload.owner,
      payload.name,
      payload.version,
      payload.requestUserId,
    );
    if (!item) {
      throw new Error(
        `Registry item not found: @${payload.owner}/${payload.name}@${payload.version}`,
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
        (spec) =>
          !!spec &&
          !spec.startsWith("./") &&
          !spec.startsWith("../") &&
          !spec.startsWith("/"),
      )
      .sort();

    const buildResult = await buildPreviewBundle(
      {
        name: payload.name,
        version: payload.version,
        files,
        dependencies: runtimeDeps,
        previewExport,
      },
      previewProps,
      { mode, debug: false },
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

    let uploadedCssUrl: string | null = null;
    if (buildResult.css && buildResult.css.trim().length > 0) {
      const cssPath = buildRegistryPreviewArtifactPath({
        owner: payload.owner,
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
      uploadedCssUrl = uploadedCss.url;
    }

    const manifest = {
      owner: payload.owner,
      name: payload.name,
      version: payload.version,
      mode,
      storyId: normalizedStoryId,
      artifactKey,
      generatedAt: new Date().toISOString(),
      jsUrl: uploadedJs.url,
      cssUrl: uploadedCssUrl,
    };
    const manifestPath = buildRegistryPreviewArtifactPath({
      owner: payload.owner,
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

    await db
      .update(registryPreviewArtifacts)
      .set({
        status: "ready",
        jsUrl: uploadedJs.url,
        cssUrl: uploadedCssUrl,
        manifestUrl: uploadedManifest.url,
        finishedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(eq(registryPreviewArtifacts.artifactKey, artifactKey));

    await completePreviewArtifactJob(jobId);
    return {
      ok: true as const,
      artifactKey,
      jsUrl: uploadedJs.url,
      cssUrl: uploadedCssUrl,
      manifestUrl: uploadedManifest.url,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown preview artifact build error";

    await db
      .update(registryPreviewArtifacts)
      .set({
        status: "failed",
        finishedAt: new Date(),
        lastErrorCode: "PREVIEW_ARTIFACT_BUILD_FAILED",
        lastErrorMessage: message,
      })
      .where(eq(registryPreviewArtifacts.artifactKey, artifactKey));

    await failPreviewArtifactJob(jobId, message);
    throw error;
  }
}
