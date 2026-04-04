alter table "registry_preview_artifacts"
  add column "artifact_capability" text default 'managed-artifact' not null;

update "registry_preview_artifacts"
set "artifact_capability" = case
  when "status" = 'skipped' then 'runtime-only'
  else 'managed-artifact'
end;
