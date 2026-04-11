ALTER TABLE "registry_projects"
ADD COLUMN "status" text DEFAULT 'active' NOT NULL;

ALTER TABLE "registry_projects"
ADD COLUMN "archived_at" timestamp;

ALTER TABLE "registry_projects"
ADD COLUMN "archived_by" text;

ALTER TABLE "registry_projects"
ADD COLUMN "deleted_at" timestamp;

ALTER TABLE "registry_projects"
ADD CONSTRAINT "registry_projects_archived_by_user_id_fk"
FOREIGN KEY ("archived_by") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action;
