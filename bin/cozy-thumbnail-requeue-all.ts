#!/usr/bin/env tsx

import "dotenv/config";
import process from "node:process";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { registryItems, registryItemVersions, user } from "@/lib/db/schema";
import { getCurrentVersion } from "@/lib/registry";
import { enqueueThumbnailJob } from "@/lib/thumbnail-jobs";

function removeThumbnail(meta: Record<string, unknown> | null | undefined) {
  const next = meta && typeof meta === "object" ? { ...meta } : {};
  delete (next as Record<string, unknown>).thumbnail;
  return next;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");

  const items = await db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      ownerHandle: user.handle,
      name: registryItems.name,
      type: registryItems.type,
      currentVersion: registryItems.currentVersion,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .leftJoin(user, eq(registryItems.userId, user.id));

  let processed = 0;
  let skipped = 0;

  for (const item of items) {
    const currentVersion = getCurrentVersion(item);
    const [itemVersion] = await db
      .select({
        id: registryItemVersions.id,
        meta: registryItemVersions.meta,
        version: registryItemVersions.version,
      })
      .from(registryItemVersions)
      .where(eq(registryItemVersions.itemId, item.id));

    const matchedVersion = itemVersion?.version === currentVersion
      ? itemVersion
      : (
          await db
            .select({
              id: registryItemVersions.id,
              meta: registryItemVersions.meta,
              version: registryItemVersions.version,
            })
            .from(registryItemVersions)
            .where(eq(registryItemVersions.itemId, item.id))
        ).find((version) => version.version === currentVersion);

    if (!matchedVersion) {
      skipped += 1;
      continue;
    }

    const payload = {
      itemId: item.id,
      itemVersionId: matchedVersion.id,
      owner: item.ownerHandle ?? item.userId ?? "legacy",
      name: item.name,
      version: currentVersion,
      type: item.type,
    };

    if (dryRun) {
      process.stdout.write(`${JSON.stringify({ dryRun: true, ...payload })}\n`);
      processed += 1;
      continue;
    }

    await db
      .update(registryItems)
      .set({ meta: removeThumbnail(item.meta) })
      .where(eq(registryItems.id, item.id));

    await db
      .update(registryItemVersions)
      .set({ meta: removeThumbnail(matchedVersion.meta) })
      .where(eq(registryItemVersions.id, matchedVersion.id));

    await enqueueThumbnailJob({
      itemId: item.id,
      itemVersionId: matchedVersion.id,
      payload: {
        ownerId: item.userId ?? "legacy",
        ownerHandle: item.ownerHandle ?? null,
        name: item.name,
        version: currentVersion,
        type: item.type,
      },
    });

    process.stdout.write(`${JSON.stringify({ requeued: true, ...payload })}\n`);
    processed += 1;
  }

  process.stdout.write(
    `${JSON.stringify({ done: true, processed, skipped, dryRun })}\n`,
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
