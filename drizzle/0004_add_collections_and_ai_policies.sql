CREATE TABLE "registry_api_key_policies" (
	"api_key_id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"allowed_collection_ids" jsonb DEFAULT '[]'::jsonb,
	"allowed_types" jsonb DEFAULT '[]'::jsonb,
	"allowed_owner_handles_or_ids" jsonb DEFAULT '[]'::jsonb,
	"allow_public_outside_collections" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_collection_items" (
	"collection_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registry_collection_items_collection_id_item_id_pk" PRIMARY KEY("collection_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "registry_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "registry_collections_owner_slug_key" UNIQUE("owner_user_id","slug")
);
--> statement-breakpoint
ALTER TABLE "registry_api_key_policies" ADD CONSTRAINT "registry_api_key_policies_api_key_id_apikey_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikey"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "registry_api_key_policies" ADD CONSTRAINT "registry_api_key_policies_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "registry_collection_items" ADD CONSTRAINT "registry_collection_items_collection_id_registry_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."registry_collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "registry_collection_items" ADD CONSTRAINT "registry_collection_items_item_id_registry_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."registry_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "registry_collections" ADD CONSTRAINT "registry_collections_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "registry_api_key_policies_ownerUserId_idx" ON "registry_api_key_policies" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX "registry_collection_items_collectionId_idx" ON "registry_collection_items" USING btree ("collection_id");
--> statement-breakpoint
CREATE INDEX "registry_collection_items_itemId_idx" ON "registry_collection_items" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "registry_collections_ownerUserId_idx" ON "registry_collections" USING btree ("owner_user_id");
