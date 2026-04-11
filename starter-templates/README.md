# Starter Templates

This directory stores repo-local starter templates used during project initialization.

V1 rules:

- Templates live in the repo, not in the database.
- `lib/starter-kits.ts` is the manifest and points here via `templateKey`.
- Creating a project from a starter kit should materialize these templates into project-scoped registry items.

Current template namespace:

- `primitives/*`
- `themes/*`

Each template directory should eventually contain the source bundle and optional metadata needed to create a canonical project item.

## Unified Template Format

Each starter template should follow this structure:

```text
starter-templates/<family>/<name>/
  template.json
  README.md
  files/
    index.tsx | theme.css | index.txt
```

`template.json` fields:

- `schemaVersion`
- `templateKey`
- `resourceType`
- `title`
- `description`
- `entryFile`
- `files`
- `templateDependencies`
- `declaredDependencies`

`templateDependencies` is optional in simple templates and required only when one
starter template depends on another starter template. Each dependency should
declare:

- `templateKey`
- `localStubPath`

The materializer creates dependency items first, writes `registryDependencies`,
and synthesizes local stub files at `localStubPath` that re-export the canonical
registry dependency ref.

`declaredDependencies` is used for explicit third-party package versions. This is
important for trusted built-in packages, because preview artifact governance
requires publish-time versions to avoid degrading them to `runtime-only`.

## Scaffold Script

Use the scaffold script to create new starter templates:

```bash
pnpm starter-template:new --template-key primitives/button --resource-type registry:ui --title Button
pnpm starter-template:new --template-key blocks/marketing-hero --resource-type registry:block --title "Marketing Hero"
pnpm starter-template:new --template-key themes/cozy-default --resource-type registry:theme --title "Cozy Default Theme"
```

The script creates:

- `template.json`
- `README.md`
- a default entry file under `files/`
