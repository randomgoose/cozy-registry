/**
 * Backfill preview.html for existing ready artifacts that don't have one yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-preview-html.ts [--dry-run] [--limit N]
 *
 * Or with explicit env:
 *   npx tsx bin/run-with-env.ts dev npx tsx scripts/backfill-preview-html.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.dev", override: true });
loadEnv({ path: ".env.local", override: true });
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { registryPreviewArtifacts } from "@/lib/db/schema";
import { buildArtifactPreviewHtml } from "@/lib/preview-artifact-html";
import type { PreviewCompatibleExternal } from "@/lib/preview-dependency-provider";
import { resolveCompatibleExternalDelivery } from "@/lib/preview-compatible-delivery";
import { uploadPublicAsset, buildRegistryPreviewArtifactPath } from "@/lib/storage";
import { sha256 } from "@/lib/preview-build-cache";

function publicAssetUrlWithContentBust(url: string, body: string): string {
  const id = sha256(body).replace(/^sha256:/, "").slice(0, 16);
  return `${url}${url.includes("?") ? "&" : "?"}v=${id}`;
}

type ManifestJson = {
  owner?: string;
  name?: string;
  version?: string;
  mode?: string;
  artifactKey?: string;
  jsUrl?: string;
  cssUrl?: string | null;
  dependencyPlan?: {
    compatibleExternals?: Array<{
      packageName: string;
      requestedVersion: string | null;
      importMapTarget: string;
      deliveryMode?: "compatible-remote" | "compatible-bundled";
      sourceUrl?: string | null;
      publicUrl?: string | null;
      cacheKey?: string | null;
      contentHash?: string | null;
    }>;
  };
};

async function ensureColumns() {
  const [htmlUrlCol] = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'registry_preview_artifacts' AND column_name = 'html_url'
  `);
  if (!htmlUrlCol) {
    console.log("Column html_url missing — running migration...");
    await db.execute(sql`ALTER TABLE "registry_preview_artifacts" ADD COLUMN "html_url" text`);
    console.log("html_url migration applied.");
  }

  const [htmlContentCol] = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'registry_preview_artifacts' AND column_name = 'html_content'
  `);
  if (!htmlContentCol) {
    console.log("Column html_content missing — running migration...");
    await db.execute(sql`ALTER TABLE "registry_preview_artifacts" ADD COLUMN "html_content" text`);
    console.log("html_content migration applied.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 50 : 500;

  await ensureColumns();

  console.log(`Backfilling preview HTML for ready artifacts (limit=${limit}, dryRun=${dryRun})`);

  const artifacts = await db
    .select({
      id: registryPreviewArtifacts.id,
      mode: registryPreviewArtifacts.mode,
      jsUrl: registryPreviewArtifacts.jsUrl,
      cssUrl: registryPreviewArtifacts.cssUrl,
      manifestUrl: registryPreviewArtifacts.manifestUrl,
      artifactKey: registryPreviewArtifacts.artifactKey,
    })
    .from(registryPreviewArtifacts)
    .where(
      and(
        eq(registryPreviewArtifacts.status, "ready"),
        isNull(registryPreviewArtifacts.htmlContent),
        isNotNull(registryPreviewArtifacts.jsUrl),
      ),
    )
    .limit(limit);

  console.log(`Found ${artifacts.length} artifacts to backfill`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const artifact of artifacts) {
    try {
      if (!artifact.jsUrl) {
        skipped++;
        continue;
      }

      let compatibleExternals: PreviewCompatibleExternal[] = [];
      let manifestData: ManifestJson | null = null;
      const mode = (artifact.mode === "thumbnail" ? "thumbnail" : "default") as
        | "default"
        | "thumbnail";

      if (artifact.manifestUrl) {
        try {
          const res = await fetch(artifact.manifestUrl);
          if (res.ok) {
            manifestData = (await res.json()) as ManifestJson;
            compatibleExternals =
              manifestData?.dependencyPlan?.compatibleExternals?.map((entry) =>
                entry.sourceUrl || entry.deliveryMode || entry.publicUrl
                  ? {
                      packageName: entry.packageName,
                      requestedVersion: entry.requestedVersion,
                      importMapTarget: entry.importMapTarget,
                      deliveryMode: entry.deliveryMode ?? "compatible-remote",
                      sourceUrl:
                        entry.sourceUrl ??
                        resolveCompatibleExternalDelivery({
                          packageName: entry.packageName,
                          requestedVersion: entry.requestedVersion,
                          importMapTarget: entry.importMapTarget,
                          isDev: mode === "default",
                        }).sourceUrl,
                      publicUrl: entry.publicUrl ?? null,
                      cacheKey: entry.cacheKey ?? null,
                      contentHash: entry.contentHash ?? null,
                    }
                  : resolveCompatibleExternalDelivery({
                      packageName: entry.packageName,
                      requestedVersion: entry.requestedVersion,
                      importMapTarget: entry.importMapTarget,
                      isDev: mode === "default",
                    }),
              ) ?? [];
          }
        } catch {
          // proceed without manifest data
        }
      }

      const hasCompatibleExternals = compatibleExternals.length > 0;
      const html = buildArtifactPreviewHtml({
        jsUrl: artifact.jsUrl,
        cssUrl: artifact.cssUrl,
        compatibleExternals,
        mode,
        bundledReact: !hasCompatibleExternals,
      });

      if (dryRun) {
        console.log(`[DRY RUN] Would backfill artifact ${artifact.id} (${html.length} bytes)`);
        success++;
        continue;
      }

      const owner = manifestData?.owner ?? "unknown";
      const itemName = manifestData?.name ?? "unknown";
      const version = manifestData?.version ?? "0.0.0";

      const htmlPath = buildRegistryPreviewArtifactPath({
        owner,
        project: null,
        itemName,
        version,
        mode,
        artifactKey: artifact.artifactKey,
        filename: "preview.html",
      });

      const uploaded = await uploadPublicAsset({
        path: htmlPath,
        body: html,
        contentType: "text/html; charset=utf-8",
        cacheControl: "31536000",
        assetType: "preview-artifact",
      });

      const htmlUrl = publicAssetUrlWithContentBust(uploaded.url, html);

      await db
        .update(registryPreviewArtifacts)
        .set({ htmlUrl, htmlContent: html })
        .where(eq(registryPreviewArtifacts.id, artifact.id));

      success++;
      if (success % 10 === 0) {
        console.log(`Progress: ${success} succeeded, ${failed} failed, ${skipped} skipped`);
      }
    } catch (err) {
      failed++;
      console.error(`Failed to backfill artifact ${artifact.id}:`, err);
    }
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed, ${skipped} skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
