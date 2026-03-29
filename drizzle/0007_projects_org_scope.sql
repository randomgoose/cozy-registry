-- Projects (replacing collections), organization-scoped registry items, remove team from data plane.
-- Run after backups; duplicate (organization_id, name) on registry_items after team merge will fail — resolve manually if needed.

-- 1) registry_projects + copy from registry_collections (preserve ids)
CREATE TABLE "registry_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text REFERENCES "organization"("id") ON DELETE cascade,
	"owner_user_id" text REFERENCES "user"("id") ON DELETE cascade,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registry_projects_scope_chk" CHECK (
		("organization_id" IS NOT NULL AND "owner_user_id" IS NULL)
		OR ("organization_id" IS NULL AND "owner_user_id" IS NOT NULL)
	)
);

CREATE UNIQUE INDEX "registry_projects_org_slug_key"
ON "registry_projects" ("organization_id", "slug")
WHERE "organization_id" IS NOT NULL;

CREATE UNIQUE INDEX "registry_projects_user_slug_key"
ON "registry_projects" ("owner_user_id", "slug")
WHERE "owner_user_id" IS NOT NULL;

CREATE INDEX "registry_projects_organization_id_idx" ON "registry_projects" ("organization_id");
CREATE INDEX "registry_projects_owner_user_id_idx" ON "registry_projects" ("owner_user_id");

INSERT INTO "registry_projects" ("id", "organization_id", "owner_user_id", "slug", "title", "description", "visibility", "created_at", "updated_at")
SELECT
	c."id",
	CASE WHEN c."owner_team_id" IS NOT NULL THEN t."organization_id" END,
	CASE WHEN c."owner_team_id" IS NULL THEN c."owner_user_id" END,
	c."slug",
	c."title",
	c."description",
	c."visibility",
	c."created_at",
	c."updated_at"
FROM "registry_collections" c
LEFT JOIN "team" t ON t."id" = c."owner_team_id"
WHERE
	(c."owner_user_id" IS NOT NULL AND c."owner_team_id" IS NULL)
	OR (c."owner_team_id" IS NOT NULL AND t."id" IS NOT NULL);

-- 2) project membership
CREATE TABLE "registry_project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "registry_projects"("id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registry_project_members_project_user_key" UNIQUE("project_id","user_id")
);

CREATE INDEX "registry_project_members_project_id_idx" ON "registry_project_members" ("project_id");
CREATE INDEX "registry_project_members_user_id_idx" ON "registry_project_members" ("user_id");

INSERT INTO "registry_project_members" ("project_id", "user_id", "role")
SELECT p."id", p."owner_user_id", 'owner'
FROM "registry_projects" p
WHERE p."owner_user_id" IS NOT NULL;

INSERT INTO "registry_project_members" ("project_id", "user_id", "role")
SELECT DISTINCT p."id", tm."user_id",
	CASE
		WHEN m."role" = 'owner' THEN 'owner'
		WHEN m."role" = 'editor' THEN 'editor'
		ELSE 'viewer'
	END
FROM "registry_projects" p
INNER JOIN "registry_collections" c ON c."id" = p."id" AND c."owner_team_id" IS NOT NULL
INNER JOIN "team_member" tm ON tm."team_id" = c."owner_team_id"
INNER JOIN "member" m ON m."user_id" = tm."user_id" AND m."organization_id" = p."organization_id"
ON CONFLICT ("project_id", "user_id") DO NOTHING;

-- 3) project items
CREATE TABLE "registry_project_items" (
	"project_id" uuid NOT NULL REFERENCES "registry_projects"("id") ON DELETE cascade,
	"item_id" uuid NOT NULL REFERENCES "registry_items"("id") ON DELETE cascade,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registry_project_items_project_id_item_id_pk" PRIMARY KEY("project_id","item_id")
);

CREATE INDEX "registry_project_items_project_id_idx" ON "registry_project_items" ("project_id");
CREATE INDEX "registry_project_items_item_id_idx" ON "registry_project_items" ("item_id");

INSERT INTO "registry_project_items" ("project_id", "item_id", "added_at")
SELECT ci."collection_id", ci."item_id", ci."added_at"
FROM "registry_collection_items" ci
INNER JOIN "registry_projects" p ON p."id" = ci."collection_id";

-- 4) registry_items: team -> organization
ALTER TABLE "registry_items" ADD COLUMN "organization_id" text;

UPDATE "registry_items" ri
SET "organization_id" = t."organization_id"
FROM "team" t
WHERE ri."team_id" = t."id";

UPDATE "registry_items" SET "user_id" = NULL WHERE "organization_id" IS NOT NULL;

ALTER TABLE "registry_items" DROP CONSTRAINT IF EXISTS "registry_items_team_id_team_id_fk";
ALTER TABLE "registry_items" DROP CONSTRAINT IF EXISTS "registry_items_team_name_key";
DROP INDEX IF EXISTS "registry_items_teamId_idx";
ALTER TABLE "registry_items" DROP COLUMN IF EXISTS "team_id";

CREATE UNIQUE INDEX "registry_items_organization_name_key"
ON "registry_items" ("organization_id", "name")
WHERE "organization_id" IS NOT NULL;

CREATE INDEX "registry_items_organization_id_idx" ON "registry_items" ("organization_id");

ALTER TABLE "registry_items" ADD CONSTRAINT "registry_items_user_or_org_chk" CHECK (
	("user_id" IS NOT NULL AND "organization_id" IS NULL)
	OR ("user_id" IS NULL AND "organization_id" IS NOT NULL)
);

ALTER TABLE "registry_items" ADD CONSTRAINT "registry_items_organization_id_organization_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade;

-- 5) API key policies
ALTER TABLE "registry_api_key_policies" RENAME COLUMN "allowed_collection_ids" TO "allowed_project_ids";

ALTER TABLE "registry_api_key_policies" ADD COLUMN "owner_organization_id" text;

UPDATE "registry_api_key_policies" pol
SET "owner_organization_id" = t."organization_id"
FROM "team" t
WHERE pol."owner_team_id" = t."id";

ALTER TABLE "registry_api_key_policies" DROP CONSTRAINT IF EXISTS "registry_api_key_policies_owner_team_id_team_id_fk";
DROP INDEX IF EXISTS "registry_api_key_policies_ownerTeamId_idx";
ALTER TABLE "registry_api_key_policies" DROP COLUMN IF EXISTS "owner_team_id";

CREATE INDEX "registry_api_key_policies_owner_organization_id_idx"
ON "registry_api_key_policies" ("owner_organization_id");

ALTER TABLE "registry_api_key_policies" ADD CONSTRAINT "registry_api_key_policies_owner_organization_id_organization_id_fk"
FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade;

-- 6) drop legacy collection tables
DROP TABLE IF EXISTS "registry_collection_items";
DROP TABLE IF EXISTS "registry_collections";
