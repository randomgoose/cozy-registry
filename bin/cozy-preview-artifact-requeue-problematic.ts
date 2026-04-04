#!/usr/bin/env tsx

import "dotenv/config";
import process from "node:process";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organization,
  registryItems,
  registryItemVersions,
  registryPreviewArtifacts,
  user,
} from "@/lib/db/schema";
import { enqueuePreviewArtifactJob } from "@/lib/preview-artifact-jobs";

type AllowedStatus = "failed" | "skipped" | "queued" | "running" | "ready";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const dryRun = args.has("--dry-run");

  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const limit = (() => {
    const raw = limitArg?.split("=")[1];
    const parsed = raw ? Number.parseInt(raw, 10) : 10;
    if (!Number.isFinite(parsed) || parsed <= 0) return 10;
    return Math.min(parsed, 100);
  })();

  const statusArg = argv.find((arg) => arg.startsWith("--status="));
  const statuses = (() => {
    const raw = statusArg?.split("=")[1]?.trim();
    if (!raw) return ["failed", "skipped"] as AllowedStatus[];
    const parsed = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(
        (entry): entry is AllowedStatus =>
          entry === "failed" ||
          entry === "skipped" ||
          entry === "queued" ||
          entry === "running" ||
          entry === "ready",
      );
    return parsed.length > 0 ? parsed : (["failed", "skipped"] as AllowedStatus[]);
  })();

  return { dryRun, limit, statuses };
}

async function main() {
  const { dryRun, limit, statuses } = parseArgs(process.argv.slice(2));

  const rows = await db
    .select({
      artifactId: registryPreviewArtifacts.id,
      artifactStatus: registryPreviewArtifacts.status,
      artifactUpdatedAt: registryPreviewArtifacts.updatedAt,
      itemId: registryPreviewArtifacts.itemId,
      itemVersionId: registryPreviewArtifacts.itemVersionId,
      mode: registryPreviewArtifacts.mode,
      storyId: registryPreviewArtifacts.storyId,
      itemName: registryItems.name,
      canonicalProjectKey: registryItems.canonicalProjectKey,
      currentVersion: registryItems.currentVersion,
      ownerUserId: registryItems.userId,
      organizationId: registryItems.organizationId,
      ownerHandle: user.handle,
      organizationSlug: organization.slug,
      version: registryItemVersions.version,
    })
    .from(registryPreviewArtifacts)
    .innerJoin(registryItems, eq(registryPreviewArtifacts.itemId, registryItems.id))
    .innerJoin(
      registryItemVersions,
      eq(registryPreviewArtifacts.itemVersionId, registryItemVersions.id),
    )
    .leftJoin(user, eq(registryItems.userId, user.id))
    .leftJoin(organization, eq(registryItems.organizationId, organization.id))
    .where(
      and(
        eq(registryItems.status, "active"),
        inArray(registryPreviewArtifacts.status, statuses),
      ),
    )
    .orderBy(desc(registryPreviewArtifacts.updatedAt))
    .limit(limit);

  let requeued = 0;
  for (const row of rows) {
    const owner =
      row.organizationSlug ??
      row.ownerHandle ??
      row.ownerUserId ??
      row.organizationId ??
      "legacy";
    const payload = {
      itemId: row.itemId,
      itemVersionId: row.itemVersionId,
      owner,
      project: row.canonicalProjectKey ?? null,
      name: row.itemName,
      version: row.version ?? row.currentVersion ?? "0.1.0",
      mode: row.mode === "thumbnail" ? "thumbnail" : "default",
      storyId: row.storyId?.trim() || null,
      previousStatus: row.artifactStatus,
      artifactId: row.artifactId,
      updatedAt:
        row.artifactUpdatedAt instanceof Date
          ? row.artifactUpdatedAt.toISOString()
          : null,
    };

    if (dryRun) {
      process.stdout.write(`${JSON.stringify({ dryRun: true, ...payload })}\n`);
      continue;
    }

    await enqueuePreviewArtifactJob({
      itemId: row.itemId,
      itemVersionId: row.itemVersionId,
      payload: {
        owner,
        project: row.canonicalProjectKey ?? null,
        name: row.itemName,
        version: row.version ?? row.currentVersion ?? "0.1.0",
        mode: row.mode === "thumbnail" ? "thumbnail" : "default",
        storyId: row.storyId?.trim() || null,
        requestUserId: row.ownerUserId ?? null,
      },
    });

    process.stdout.write(`${JSON.stringify({ requeued: true, ...payload })}\n`);
    requeued += 1;
  }

  process.stdout.write(
    `${JSON.stringify({
      done: true,
      dryRun,
      limit,
      statuses,
      matched: rows.length,
      requeued,
    })}\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
