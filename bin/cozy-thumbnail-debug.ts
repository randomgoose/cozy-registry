#!/usr/bin/env tsx

import "dotenv/config";
import process from "node:process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { capturePreviewThumbnail } from "@/lib/thumbnail-jobs";

function getArg(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const owner = getArg("owner");
  const name = getArg("name");
  const version = getArg("version");
  const strategy =
    getArg("strategy") === "locator" ? "locator" : "computed";
  const output =
    getArg("output") ??
    path.join(
      "/tmp",
      `cozy-thumbnail-${Date.now()}-${name ?? "preview"}.png`,
    );

  if (!owner || !name || !version) {
    throw new Error(
      "Usage: pnpm tsx bin/cozy-thumbnail-debug.ts --owner=<owner> --name=<name> --version=<version> [--output=/tmp/file.png]",
    );
  }

  const result = await capturePreviewThumbnail({
    owner,
    name,
    version,
    strategy,
  });

  await writeFile(output, result.buffer);
  process.stdout.write(
    `${JSON.stringify(
      {
        output,
        strategy,
        clip: result.clip,
        previewPath: result.plan.previewPath,
        diagnostics: result.diagnostics,
      },
      null,
      2,
    )}\n`,
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
