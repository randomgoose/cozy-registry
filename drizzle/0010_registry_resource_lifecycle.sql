ALTER TABLE "registry_items"
ADD COLUMN "status" text NOT NULL DEFAULT 'active';

ALTER TABLE "registry_items"
ADD COLUMN "archived_at" timestamp;

ALTER TABLE "registry_items"
ADD COLUMN "archived_by" text;

ALTER TABLE "registry_items"
ADD COLUMN "deleted_at" timestamp;

ALTER TABLE "registry_items"
ADD COLUMN "deleted_by" text;

ALTER TABLE "registry_items"
ADD COLUMN "lifecycle_reason" text;

ALTER TABLE "registry_items"
ADD CONSTRAINT "registry_items_archived_by_user_id_fk"
FOREIGN KEY ("archived_by") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "registry_items"
ADD CONSTRAINT "registry_items_deleted_by_user_id_fk"
FOREIGN KEY ("deleted_by") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "registry_items_status_idx"
ON "registry_items" ("status");

CREATE TABLE "registry_item_moves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_item_id" uuid NOT NULL REFERENCES "registry_items"("id") ON DELETE cascade,
  "target_item_id" uuid NOT NULL REFERENCES "registry_items"("id") ON DELETE cascade,
  "source_owner_ref" text NOT NULL,
  "target_owner_ref" text NOT NULL,
  "mode" text NOT NULL,
  "created_by" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "notes" text
);

CREATE INDEX "registry_item_moves_source_item_id_idx"
ON "registry_item_moves" ("source_item_id");

CREATE INDEX "registry_item_moves_target_item_id_idx"
ON "registry_item_moves" ("target_item_id");
