#!/usr/bin/env tsx

import process from "node:process";
import {
  claimPendingThumbnailJob,
  failThumbnailJob,
  processPreviewCaptureThumbnailJob,
  processThemeThumbnailJob,
} from "@/lib/thumbnail-jobs";
import { normalizeRegistryItemType, REGISTRY_THEME_TYPE } from "@/lib/registry-types";

async function main() {
  const args = new Set(process.argv.slice(2));
  const once = args.has("--once") || args.size === 0;

  if (once) {
    const processed = await runOnce();
    process.stdout.write(
      processed ? "Processed one thumbnail job.\n" : "No pending thumbnail jobs.\n",
    );
    return;
  }

  process.stdout.write("Running thumbnail worker in loop mode.\n");
  while (true) {
    const processed = await runOnce();
    if (!processed) {
      await sleep(2000);
    }
  }
}

async function runOnce() {
  const job = await claimPendingThumbnailJob();
  if (!job) return false;

  try {
    const payload = (job.payload ?? {}) as { type?: string };
    const normalizedType = normalizeRegistryItemType(payload.type ?? "");

    if (normalizedType === REGISTRY_THEME_TYPE) {
      await processThemeThumbnailJob(job.id);
      return true;
    }

    await processPreviewCaptureThumbnailJob(job.id);
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown thumbnail worker error";
    await failThumbnailJob(job.id, message);
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
