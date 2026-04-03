ALTER TABLE "registry_projects"
ADD COLUMN IF NOT EXISTS "namespace_key" text;

ALTER TABLE "registry_items"
ADD COLUMN IF NOT EXISTS "canonical_project_id" uuid;

ALTER TABLE "registry_items"
ADD COLUMN IF NOT EXISTS "canonical_project_key" text;

UPDATE "registry_projects"
SET "namespace_key" = "slug"
WHERE "namespace_key" IS NULL OR "namespace_key" = '';

ALTER TABLE "registry_projects"
ALTER COLUMN "namespace_key" SET NOT NULL;

ALTER TABLE "registry_items"
ADD CONSTRAINT "registry_items_canonical_project_id_registry_projects_id_fk"
FOREIGN KEY ("canonical_project_id") REFERENCES "registry_projects"("id")
ON DELETE SET NULL;

ALTER TABLE "registry_items"
DROP CONSTRAINT IF EXISTS "registry_items_user_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "registry_projects_org_namespace_key"
ON "registry_projects" ("organization_id", "namespace_key")
WHERE "organization_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "registry_projects_user_namespace_key"
ON "registry_projects" ("owner_user_id", "namespace_key")
WHERE "owner_user_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "registry_items_canonical_project_id_idx"
ON "registry_items" ("canonical_project_id");

CREATE UNIQUE INDEX IF NOT EXISTS "registry_items_user_project_name_key"
ON "registry_items" ("user_id", "canonical_project_key", "name")
WHERE "user_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "registry_items_org_project_name_key"
ON "registry_items" ("organization_id", "canonical_project_key", "name")
WHERE "organization_id" IS NOT NULL;
