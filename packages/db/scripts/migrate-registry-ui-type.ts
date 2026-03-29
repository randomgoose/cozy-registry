/**
 * Migration: rename legacy registry:component records to registry:ui.
 *
 * This keeps Cozy aligned with the shadcn top-level item type for reusable UI
 * components while preserving runtime compatibility through alias handling.
 *
 * Usage:
 *   pnpm tsx lib/db/migrate-registry-ui-type.ts          # apply changes
 *   DRY_RUN=1 pnpm tsx lib/db/migrate-registry-ui-type.ts # preview counts only
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@cozy/db";
import {
  registryFiles,
  registryFileVersions,
  registryItems,
} from "@cozy/db/schema";

const LEGACY_TYPE = "registry:component";
const CANONICAL_TYPE = "registry:ui";
const DRY_RUN = process.env.DRY_RUN === "1";

async function countLegacyRows() {
  const [items, files, fileVersions] = await Promise.all([
    db.select({ id: registryItems.id }).from(registryItems).where(eq(registryItems.type, LEGACY_TYPE)),
    db.select({ id: registryFiles.id }).from(registryFiles).where(eq(registryFiles.type, LEGACY_TYPE)),
    db
      .select({ id: registryFileVersions.id })
      .from(registryFileVersions)
      .where(eq(registryFileVersions.type, LEGACY_TYPE)),
  ]);

  return {
    registryItems: items.length,
    registryFiles: files.length,
    registryFileVersions: fileVersions.length,
  };
}

async function migrate() {
  const counts = await countLegacyRows();

  console.log("Legacy type counts:");
  console.log(`- registry_items: ${counts.registryItems}`);
  console.log(`- registry_files: ${counts.registryFiles}`);
  console.log(`- registry_file_versions: ${counts.registryFileVersions}`);

  if (DRY_RUN) {
    console.log("DRY_RUN=1, no changes were written.");
    return;
  }

  const [updatedItems, updatedFiles, updatedFileVersions] = await Promise.all([
    db
      .update(registryItems)
      .set({ type: CANONICAL_TYPE })
      .where(eq(registryItems.type, LEGACY_TYPE))
      .returning({ id: registryItems.id }),
    db
      .update(registryFiles)
      .set({ type: CANONICAL_TYPE })
      .where(eq(registryFiles.type, LEGACY_TYPE))
      .returning({ id: registryFiles.id }),
    db
      .update(registryFileVersions)
      .set({ type: CANONICAL_TYPE })
      .where(eq(registryFileVersions.type, LEGACY_TYPE))
      .returning({ id: registryFileVersions.id }),
  ]);

  console.log("Migration completed:");
  console.log(`- updated registry_items: ${updatedItems.length}`);
  console.log(`- updated registry_files: ${updatedFiles.length}`);
  console.log(`- updated registry_file_versions: ${updatedFileVersions.length}`);
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
