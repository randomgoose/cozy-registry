#!/usr/bin/env tsx

import "dotenv/config";
import process from "node:process";
import {
  claimPendingPreviewArtifactJob,
  processPreviewArtifactJob,
} from "@/lib/preview-artifact-jobs";

async function main() {
  const args = new Set(process.argv.slice(2));
  const once = args.has("--once") || args.size === 0;

  if (once) {
    const processed = await runOnce();
    process.stdout.write(
      processed
        ? "Processed one preview artifact job.\n"
        : "No pending preview artifact jobs.\n",
    );
    return;
  }

  process.stdout.write("Running preview artifact worker in loop mode.\n");
  while (true) {
    const processed = await runOnce();
    if (!processed) {
      await sleep(2000);
    }
  }
}

async function runOnce() {
  const job = await claimPendingPreviewArtifactJob();
  if (!job) return false;
  try {
    await processPreviewArtifactJob(job.id);
  } catch (error) {
    if (error && typeof error === "object") {
      const record = error as { message?: string; stack?: string };
      process.stderr.write(
        `${JSON.stringify(
          {
            message: record.message ?? String(error),
            stack: record.stack,
            jobId: job.id,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      process.stderr.write(
        `${JSON.stringify({ message: String(error), jobId: job.id }, null, 2)}\n`,
      );
    }
  }
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  if (error && typeof error === "object") {
    const record = error as { message?: string; stack?: string };
    process.stderr.write(
      `${JSON.stringify(
        {
          message: record.message ?? String(error),
          stack: record.stack,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stderr.write(`${String(error)}\n`);
  }
  process.exit(1);
});
