alter table "registry_preview_artifacts"
  add column if not exists "html_content" text;
