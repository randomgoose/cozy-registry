#!/usr/bin/env tsx

import "dotenv/config";
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
  if (error && typeof error === "object") {
    const record = error as {
      message?: string;
      stack?: string;
      cause?: {
        message?: string;
        code?: string;
        detail?: string;
        hint?: string;
        schema_name?: string;
        table_name?: string;
      };
    };
    const payload = {
      message: record.message ?? String(error),
      stack: record.stack,
      cause: record.cause
        ? {
            message: record.cause.message,
            code: record.cause.code,
            detail: record.cause.detail,
            hint: record.cause.hint,
            schema: record.cause.schema_name,
            table: record.cause.table_name,
          }
        : null,
      databaseUrlHost: safeHostFromUrl(process.env.DATABASE_URL ?? process.env.POSTGRES_URL),
      hasDirectUrl: Boolean(process.env.DATABASE_DIRECT_URL),
    };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stderr.write(`${String(error)}\n`);
  }
  process.exit(1);
});

function safeHostFromUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return "invalid";
  }
}
