CREATE TABLE IF NOT EXISTS "registry_preview_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL,
  "item_version_id" uuid NOT NULL,
  "mode" text DEFAULT 'default' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "artifact_key" text NOT NULL,
  "js_url" text,
  "css_url" text,
  "manifest_url" text,
  "last_error_code" text,
  "last_error_message" text,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "registry_preview_artifacts_item_version_mode_key" UNIQUE("item_version_id","mode"),
  CONSTRAINT "registry_preview_artifacts_artifact_key_key" UNIQUE("artifact_key")
);

DO $$ BEGIN
 ALTER TABLE "registry_preview_artifacts" ADD CONSTRAINT "registry_preview_artifacts_item_id_registry_items_id_fk"
 FOREIGN KEY ("item_id") REFERENCES "public"."registry_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "registry_preview_artifacts" ADD CONSTRAINT "registry_preview_artifacts_item_version_id_registry_item_versions_id_fk"
 FOREIGN KEY ("item_version_id") REFERENCES "public"."registry_item_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "registry_preview_artifacts_item_id_idx"
 ON "registry_preview_artifacts" USING btree ("item_id");
CREATE INDEX IF NOT EXISTS "registry_preview_artifacts_item_version_id_idx"
 ON "registry_preview_artifacts" USING btree ("item_version_id");
CREATE INDEX IF NOT EXISTS "registry_preview_artifacts_status_idx"
 ON "registry_preview_artifacts" USING btree ("status");
