CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"owner_team_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_items" (
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_items_project_id_item_id_pk" PRIMARY KEY("project_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_team_id_team_id_fk" FOREIGN KEY ("owner_team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_item_id_registry_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."registry_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "projects_ownerUserId_idx" ON "projects" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX "projects_ownerTeamId_idx" ON "projects" USING btree ("owner_team_id");
--> statement-breakpoint
CREATE INDEX "project_items_projectId_idx" ON "project_items" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "project_items_itemId_idx" ON "project_items" USING btree ("item_id");
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_slug_key" UNIQUE("owner_user_id","slug");
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_team_slug_key" UNIQUE("owner_team_id","slug");
--> statement-breakpoint
INSERT INTO "projects" (
  "id",
  "owner_user_id",
  "owner_team_id",
  "slug",
  "title",
  "description",
  "visibility",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "owner_user_id",
  "owner_team_id",
  "slug",
  "title",
  "description",
  "visibility",
  "created_at",
  "updated_at"
FROM "registry_collections"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "project_items" ("project_id", "item_id", "added_at")
SELECT
  "collection_id",
  "item_id",
  "added_at"
FROM "registry_collection_items"
ON CONFLICT ("project_id", "item_id") DO NOTHING;
