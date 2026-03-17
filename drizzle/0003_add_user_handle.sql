ALTER TABLE "user" ADD COLUMN "handle" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_handle_key" ON "user" USING btree ("handle");
--> statement-breakpoint
-- Backfill for legacy/system users
UPDATE "user" SET "handle" = "legacy" WHERE "id" = "legacy" AND ("handle" IS NULL OR "handle" = '');

