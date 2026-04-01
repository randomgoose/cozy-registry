ALTER TABLE "registry_preview_artifacts"
ADD COLUMN IF NOT EXISTS "story_id" text;

UPDATE "registry_preview_artifacts"
SET "story_id" = ''
WHERE "story_id" IS NULL;

ALTER TABLE "registry_preview_artifacts"
ALTER COLUMN "story_id" SET DEFAULT '';

ALTER TABLE "registry_preview_artifacts"
ALTER COLUMN "story_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "registry_preview_artifacts"
  DROP CONSTRAINT IF EXISTS "registry_preview_artifacts_item_version_mode_key";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

ALTER TABLE "registry_preview_artifacts"
ADD CONSTRAINT "registry_preview_artifacts_item_version_mode_key"
UNIQUE("item_version_id","mode","story_id");
