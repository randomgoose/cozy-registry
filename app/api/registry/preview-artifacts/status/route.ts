import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getUserIdFromToken } from "@/lib/auth-api";
import { db } from "@/lib/db";
import {
  registryItemVersions,
  registryPreviewArtifacts,
} from "@/lib/db/schema";
import {
  enqueuePreviewArtifactJob,
  formatRuntimeOnlyDependencySkipMessage,
  inferPreviewArtifactCapability,
} from "@/lib/preview-artifact-jobs";
import {
  getCurrentVersion,
  getRegistryItemByScopedIdentityAndVersion,
} from "@/lib/registry";
import { readDependencyDecisionsFromMeta } from "@/lib/third-party-dependency-governance";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner");
  const name = url.searchParams.get("name");
  const version = url.searchParams.get("v");
  const projectParam = url.searchParams.get("project");
  const project =
    typeof projectParam === "string" && projectParam.trim().length > 0
      ? projectParam.trim()
      : null;
  const storyIdRaw = url.searchParams.get("story");
  const storyId = storyIdRaw && storyIdRaw.trim().length > 0 ? storyIdRaw.trim() : null;
  const normalizedStoryId = storyId ?? "";
  const mode = url.searchParams.get("mode") === "thumbnail" ? "thumbnail" : "default";
  const shouldEnqueue = url.searchParams.get("enqueue") === "1";

  if (!owner || !name) {
    return NextResponse.json(
      { error: "Missing required query params: owner, name" },
      { status: 400 },
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? (await getUserIdFromToken(request));

  const item = await getRegistryItemByScopedIdentityAndVersion({
    ownerId: owner,
    projectKey: project,
    name,
    version,
    requestUserId: userId,
  });
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const effectiveVersion = version?.trim() ? version.trim() : getCurrentVersion(item);
  const [itemVersion] = await db
    .select({ id: registryItemVersions.id })
    .from(registryItemVersions)
    .where(
      and(
        eq(registryItemVersions.itemId, item.id),
        eq(registryItemVersions.version, effectiveVersion),
      ),
    )
    .limit(1);

  if (!itemVersion) {
    return NextResponse.json(
      {
        artifactStatus: "missing",
        owner,
        name,
        version: effectiveVersion,
        mode,
      },
      { status: 200 },
    );
  }

  const [artifact] = await db
    .select()
    .from(registryPreviewArtifacts)
    .where(
      and(
        eq(registryPreviewArtifacts.itemVersionId, itemVersion.id),
        eq(registryPreviewArtifacts.mode, mode),
        eq(registryPreviewArtifacts.storyId, normalizedStoryId),
      ),
    )
    .limit(1);

  if (!artifact) {
    if (shouldEnqueue && item.type !== "registry:theme") {
      await enqueuePreviewArtifactJob({
        itemId: item.id,
        itemVersionId: itemVersion.id,
        payload: {
          owner,
          project,
          name,
          version: effectiveVersion,
          mode,
          storyId,
          requestUserId: userId ?? null,
        },
      });
      return NextResponse.json(
        {
          artifactStatus: "queued",
          owner,
          name,
          version: effectiveVersion,
          mode,
          storyId,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        artifactStatus: "missing",
        owner,
        name,
        version: effectiveVersion,
        mode,
        storyId,
      },
      { status: 200 },
    );
  }

  const dependencyDecisions = readDependencyDecisionsFromMeta(item.meta);
  const artifactCapability = inferPreviewArtifactCapability({
    storedCapability: artifact.artifactCapability,
    artifactStatus: artifact.status,
    dependencyDecisions,
  });
  const fallbackSkippedMessage =
    artifact.status === "skipped"
      ? formatRuntimeOnlyDependencySkipMessage(dependencyDecisions)
      : null;
  const normalizedLastErrorMessage =
    artifact.status === "skipped"
      ? artifact.lastErrorMessage &&
        artifact.lastErrorMessage.includes(
          "one or more dependencies are runtime-only",
        )
        ? fallbackSkippedMessage
        : (artifact.lastErrorMessage ?? fallbackSkippedMessage)
      : artifact.lastErrorMessage;

  return NextResponse.json({
    artifactStatus: artifact.status,
    artifactCapability,
    owner,
    name,
    version: effectiveVersion,
    mode,
    storyId,
    artifactKey: artifact.artifactKey,
    artifactUrl: artifact.jsUrl,
    cssUrl: artifact.cssUrl,
    manifestUrl: artifact.manifestUrl,
    startedAt: artifact.startedAt,
    finishedAt: artifact.finishedAt,
    lastError:
      artifact.lastErrorCode || normalizedLastErrorMessage
        ? {
            code:
              artifact.lastErrorCode ??
              (artifact.status === "skipped"
                ? "SKIPPED_POLICY_NO_PREBUNDLE"
                : "PREVIEW_ARTIFACT_BUILD_FAILED"),
            message:
              normalizedLastErrorMessage ??
              (artifact.status === "skipped"
                ? "Preview artifact prebundle was skipped by policy."
                : "Preview artifact build failed."),
          }
        : null,
  });
}
