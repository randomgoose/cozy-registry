/**
 * Minimal compatible-bundled materialization script.
 *
 * Current goal:
 * - fetch a browser-safe compatible external source URL
 * - rebundle it into a platform-controlled single-file ESM artifact
 * - upload bundle + metadata to public storage
 * - seed local metadata cache so preview delivery can immediately prefer bundled delivery
 *
 * Usage:
 *   npx tsx scripts/build-compatible-bundle.ts recharts 2.15.3
 *   npx tsx scripts/build-compatible-bundle.ts @radix-ui/react-dropdown-menu 2.1.15 --upload
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.dev", override: true });
loadEnv({ path: ".env.local", override: true });

import {
  resolveCompatibleExternalDelivery,
} from "@/lib/preview-compatible-delivery";
import { materializeCompatibleBundle } from "@/lib/compatible-bundle-materializer";

async function main() {
  const args = process.argv.slice(2);
  const packageName = args[0]?.trim();
  const version = args[1]?.trim();
  const shouldUpload = args.includes("--upload");

  if (!packageName || !version) {
    throw new Error("Usage: npx tsx scripts/build-compatible-bundle.ts <packageName> <version> [--upload]");
  }

  const entry = resolveCompatibleExternalDelivery({
    packageName,
    requestedVersion: version,
    importMapTarget: packageName,
    isDev: false,
  });

  console.log(`Building compatible bundle for ${packageName}@${version}`);
  console.log(`Source: ${entry.sourceUrl}`);
  console.log(`Cache key: ${entry.cacheKey}`);

  const metadata = await materializeCompatibleBundle({
    entry,
    upload: shouldUpload,
  });

  console.log(`Bundle ready → ${metadata.publicUrl}`);
  console.log(`Cache key → ${metadata.cacheKey}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
