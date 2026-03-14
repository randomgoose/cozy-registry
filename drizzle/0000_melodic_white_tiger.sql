CREATE TABLE "registry_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"dependencies" jsonb DEFAULT '[]'::jsonb,
	"registry_dependencies" jsonb DEFAULT '[]'::jsonb,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registry_items_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "registry_files" ADD CONSTRAINT "registry_files_item_id_registry_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."registry_items"("id") ON DELETE cascade ON UPDATE no action;