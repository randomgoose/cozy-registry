Status: draft
Owner: engineering
Last updated: 2026-04-11
Source of truth: no

# Starter Template Format

## Goal

Define one repo-local starter template format that works for:

- `registry:ui`
- `registry:block`
- `registry:theme`
- future resource types

## Directory Shape

Each starter template lives under:

```text
starter-templates/<family>/<name>/
  template.json
  README.md
  files/
    ...
```

Example:

```text
starter-templates/primitives/button/
  template.json
  README.md
  files/index.tsx
```

## Manifest

`template.json` should include:

- `schemaVersion`
- `templateKey`
- `resourceType`
- `title`
- `description`
- `entryFile`
- `files`
- `templateDependencies`
- `declaredDependencies`
- `previewProps`
- `previewExport`
- `previewStories`
- `previewDefaultStoryId`

The initial schema is defined in:

- [starter-template-format.ts](/Users/chenchen/Documents/GitHub/my-app/lib/starter-template-format.ts)

## Scaffold Script

Use:

```bash
pnpm starter-template:new --template-key primitives/button --resource-type registry:ui --title Button
```

The script lives at:

- [create-starter-template.ts](/Users/chenchen/Documents/GitHub/my-app/scripts/create-starter-template.ts)

## V1 Source Model

V1 starter kits should point to repo templates via `templateKey`.

That means:

- starter kit manifests declare what should be initialized
- repo templates define how each initial resource is shaped
- project initialization materializes repo templates into project-scoped registry items

## Template Dependencies

V1 supports explicit cross-template dependencies only.

If one template depends on another, declare it in `template.json`:

```json
{
  "templateDependencies": [
    {
      "templateKey": "primitives/button",
      "localStubPath": "files/Button.tsx"
    }
  ]
}
```

Rules:

- Do not rely on dependency scanning between templates.
- Do not import another template directory directly without declaring it.
- The materializer must create dependency templates first.
- The materializer should persist `registryDependencies` and synthesize Cozy stub files for the declared `localStubPath`.

## Third-Party Dependencies

Starter templates may also declare explicit third-party package versions in `template.json`:

```json
{
  "declaredDependencies": [
    { "name": "@base-ui/react", "version": "1.3.0" },
    { "name": "lucide-react", "version": "0.577.0" }
  ]
}
```

Rules:

- Use canonical package names that match governance normalization.
- For `@base-ui/react/*` imports, declare `@base-ui/react`.
- These versions are forwarded into `createRegistryItem(...)`.
- The materializer computes `dependencyDecisions` from source imports plus `declaredDependencies`, so starter-generated items get a complete dependency snapshot.

## Shared Resource Payload

Starter templates do not need to share the same transport protocol as MCP publish.

They should, however, converge on the same internal resource payload shape.

Current shared payload entry point:

- [registry-resource-payload.ts](/Users/chenchen/Documents/GitHub/my-app/lib/registry-resource-payload.ts)

This shared payload is where starter templates and future publish normalization should align on:

- resource type / title / description
- files
- registry dependencies
- declared third-party dependencies
- preview metadata
