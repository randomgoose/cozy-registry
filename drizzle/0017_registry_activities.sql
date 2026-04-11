CREATE TABLE IF NOT EXISTS "registry_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "organization_id" text REFERENCES "organization"("id") ON DELETE SET NULL,
  "owner_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "canonical_project_id" uuid REFERENCES "registry_projects"("id") ON DELETE SET NULL,
  "item_id" uuid REFERENCES "registry_items"("id") ON DELETE SET NULL,
  "item_version_id" uuid REFERENCES "registry_item_versions"("id") ON DELETE SET NULL,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "actor_type" text NOT NULL,
  "event_type" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_name" text NOT NULL,
  "resource_title" text,
  "resource_owner_ref" text,
  "version_label" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "correlation_id" text
);

CREATE INDEX IF NOT EXISTS "registry_activities_organization_created_idx"
  ON "registry_activities" ("organization_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "registry_activities_owner_created_idx"
  ON "registry_activities" ("owner_user_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "registry_activities_project_created_idx"
  ON "registry_activities" ("canonical_project_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "registry_activities_item_created_idx"
  ON "registry_activities" ("item_id", "created_at");
