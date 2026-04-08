ALTER TABLE "registry_projects"
ADD COLUMN IF NOT EXISTS "default_theme_resource_refs" jsonb DEFAULT '[]'::jsonb;

UPDATE "registry_projects"
SET "default_theme_resource_refs" =
  CASE
    WHEN "default_theme_resource_ref" IS NULL OR btrim("default_theme_resource_ref") = '' THEN '[]'::jsonb
    ELSE jsonb_build_array("default_theme_resource_ref")
  END
WHERE "default_theme_resource_refs" IS NULL
   OR "default_theme_resource_refs" = '[]'::jsonb;
