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
  getCurrentVersion,
  getRegistryItemByOwnerNameAndVersion,
} from "@/lib/registry";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner");
  const name = url.searchParams.get("name");
  const version = url.searchParams.get("v");
  const storyIdRaw = url.searchParams.get("story");
  const storyId = storyIdRaw && storyIdRaw.trim().length > 0 ? storyIdRaw.trim() : null;
  const normalizedStoryId = storyId ?? "";
  const mode = url.searchParams.get("mode") === "thumbnail" ? "thumbnail" : "default";

  if (!owner || !name) {
    return NextResponse.json(
      { error: "Missing required query params: owner, name" },
      { status: 400 },
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? (await getUserIdFromToken(request));

  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    version,
    userId,
  );
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

  return NextResponse.json({
    artifactStatus: artifact.status,
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
      artifact.lastErrorCode || artifact.lastErrorMessage
        ? {
            code:
              artifact.lastErrorCode ??
              (artifact.status === "skipped"
                ? "SKIPPED_POLICY_NO_PREBUNDLE"
                : "PREVIEW_ARTIFACT_BUILD_FAILED"),
            message:
              artifact.lastErrorMessage ??
              (artifact.status === "skipped"
                ? "Preview artifact prebundle was skipped by policy."
                : "Preview artifact build failed."),
          }
        : null,
  });
}
