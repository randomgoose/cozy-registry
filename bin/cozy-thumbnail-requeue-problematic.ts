#!/usr/bin/env tsx

import "dotenv/config";
import process from "node:process";
import { and, desc, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organization,
  registryAssetJobs,
  registryItems,
  registryItemVersions,
  user,
} from "@/lib/db/schema";
import { enqueueThumbnailJob, GENERATE_THUMBNAIL_JOB } from "@/lib/thumbnail-jobs";

type AllowedStatus = "failed" | "processing" | "pending" | "completed";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const dryRun = args.has("--dry-run");
  const includeCompleted = args.has("--include-completed");

  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const limit = (() => {
    const raw = limitArg?.split("=")[1];
    const parsed = raw ? Number.parseInt(raw, 10) : 20;
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.min(parsed, 200);
  })();

  const statusArg = argv.find((arg) => arg.startsWith("--status="));
  const statuses = (() => {
    const raw = statusArg?.split("=")[1]?.trim();
    if (!raw) {
      return includeCompleted
        ? (["failed", "completed"] as AllowedStatus[])
        : (["failed"] as AllowedStatus[]);
    }
    const parsed = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(
        (entry): entry is AllowedStatus =>
          entry === "failed" ||
          entry === "processing" ||
          entry === "pending" ||
          entry === "completed",
      );
    return parsed.length > 0 ? parsed : (["failed"] as AllowedStatus[]);
  })();

  const errorContainsArg = argv.find((arg) => arg.startsWith("--error-contains="));
  const errorContains = errorContainsArg?.split("=")[1]?.trim() || "Not found";

  return { dryRun, includeCompleted, limit, statuses, errorContains };
}

async function main() {
  const { dryRun, includeCompleted, limit, statuses, errorContains } = parseArgs(
    process.argv.slice(2),
  );

  const errorFilter =
    errorContains.trim().length > 0
      ? ilike(registryAssetJobs.lastError, `%${errorContains.trim()}%`)
      : isNotNull(registryAssetJobs.lastError);

  const rows = await db
    .select({
      jobId: registryAssetJobs.id,
      jobStatus: registryAssetJobs.status,
      jobUpdatedAt: registryAssetJobs.updatedAt,
      lastError: registryAssetJobs.lastError,
      itemId: registryAssetJobs.itemId,
      itemVersionId: registryAssetJobs.itemVersionId,
      itemName: registryItems.name,
      itemType: registryItems.type,
      canonicalProjectKey: registryItems.canonicalProjectKey,
      ownerUserId: registryItems.userId,
      organizationId: registryItems.organizationId,
      ownerHandle: user.handle,
      organizationSlug: organization.slug,
      version: registryItemVersions.version,
    })
    .from(registryAssetJobs)
    .innerJoin(registryItems, eq(registryAssetJobs.itemId, registryItems.id))
    .leftJoin(
      registryItemVersions,
      eq(registryAssetJobs.itemVersionId, registryItemVersions.id),
    )
    .leftJoin(user, eq(registryItems.userId, user.id))
    .leftJoin(organization, eq(registryItems.organizationId, organization.id))
    .where(
      and(
        eq(registryAssetJobs.jobType, GENERATE_THUMBNAIL_JOB),
        inArray(registryAssetJobs.status, statuses),
        errorFilter,
      ),
    )
    .orderBy(desc(registryAssetJobs.updatedAt))
    .limit(limit);

  let requeued = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.itemVersionId || !row.version) {
      skipped += 1;
      process.stdout.write(
        `${JSON.stringify({
          skipped: true,
          reason: "missing itemVersionId or version",
          jobId: row.jobId,
          itemId: row.itemId,
          itemName: row.itemName,
        })}\n`,
      );
      continue;
    }

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
      version: row.version,
      type: row.itemType,
      previousJobId: row.jobId,
      previousStatus: row.jobStatus,
      lastError: row.lastError,
      updatedAt:
        row.jobUpdatedAt instanceof Date ? row.jobUpdatedAt.toISOString() : null,
    };

    if (dryRun) {
      process.stdout.write(`${JSON.stringify({ dryRun: true, ...payload })}\n`);
      continue;
    }

    await enqueueThumbnailJob({
      itemId: row.itemId,
      itemVersionId: row.itemVersionId,
      payload: {
        ownerId: owner,
        ownerHandle: row.ownerHandle ?? row.organizationSlug ?? null,
        projectKey: row.canonicalProjectKey ?? null,
        name: row.itemName,
        version: row.version,
        type: row.itemType,
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
      errorContains,
      matched: rows.length,
      requeued,
      skipped,
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
