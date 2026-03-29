/**
 * Migration: Assign "legacy" userId to registry items with null userId.
 * Run before db:push when migrating to per-user namespacing.
 * Usage: pnpm tsx lib/db/migrate-legacy-owner.ts
 */
import "dotenv/config";
import { db } from "@cozy/db";
import { user, registryItems } from "@cozy/db/schema";
import { eq, isNull } from "drizzle-orm";

const LEGACY_USER_ID = "legacy";

async function migrate() {
  // Ensure legacy user exists
  const [existing] = await db.select().from(user).where(eq(user.id, LEGACY_USER_ID)).limit(1);
  if (!existing) {
    await db.insert(user).values({
      id: LEGACY_USER_ID,
      name: "Legacy",
      email: "legacy@system.local",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("Created legacy user");
  }

  // Update registry items with null userId
  const result = await db
    .update(registryItems)
    .set({ userId: LEGACY_USER_ID })
    .where(isNull(registryItems.userId))
    .returning({ id: registryItems.id });

  console.log(`Updated ${result.length} registry items to legacy owner`);
}

migrate().catch(console.error).finally(() => process.exit(0));
