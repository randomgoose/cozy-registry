ALTER TABLE "team"
ADD COLUMN IF NOT EXISTS "slug" text;

CREATE UNIQUE INDEX IF NOT EXISTS "team_organization_slug_key"
ON "team" ("organization_id", "slug");
