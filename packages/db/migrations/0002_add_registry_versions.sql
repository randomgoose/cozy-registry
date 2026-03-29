CREATE TABLE "registry_file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_version_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_item_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"dependencies" jsonb DEFAULT '[]'::jsonb,
	"registry_dependencies" jsonb DEFAULT '[]'::jsonb,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registry_item_versions_item_version_key" UNIQUE("item_id","version")
);
--> statement-breakpoint
ALTER TABLE "registry_items" ADD COLUMN "current_version" text;--> statement-breakpoint
ALTER TABLE "registry_file_versions" ADD CONSTRAINT "registry_file_versions_item_version_id_registry_item_versions_id_fk" FOREIGN KEY ("item_version_id") REFERENCES "public"."registry_item_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_item_versions" ADD CONSTRAINT "registry_item_versions_item_id_registry_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."registry_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registry_item_versions_itemId_idx" ON "registry_item_versions" USING btree ("item_id");