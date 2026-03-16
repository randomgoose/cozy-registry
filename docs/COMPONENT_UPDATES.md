## Component Updates & Lockfile Convention

This document describes how projects can keep track of which registry components they are using, and how to check for updates.

The goal is to support:

- **Developers**: know when a component has a newer version in the registry.
- **Tools / AI / CLI**: read a simple manifest and suggest or perform upgrades.

---

## 1. Lockfile: `cozy-registry.lock.json`

When you install a component into a project, we recommend writing a small lockfile at the project root:

```jsonc
{
  "@owner/trading-button": {
    "version": "0.2.1",
    "source": "https://cozy-registry.vercel.app/api/r/owner/trading-button"
  },
  "@legacy/hero-section": {
    "version": "0.1.0",
    "source": "https://cozy-registry.vercel.app/api/r/legacy/hero-section"
  }
}
```

### 1.1 Fields

- **`@owner/name`**: registry coordinate. `owner` is the userId (or `legacy` for imported content), `name` is the kebab-case component name.
- **`version`**: the version you installed into this project.
- **`source`**: the API URL used to fetch the component. This can include a base URL of your own Cozy Registry deployment.

### 1.2 How tools can use it

- A CLI or AI can:
  - Read `cozy-registry.lock.json`.
  - For each entry, call:
    - `GET /api/registry/:owner/:name/versions` (see below), or
    - MCP tool `get_component_versions`.
  - Compare the locked `version` with the latest available.
  - Suggest or perform an upgrade (e.g. re-run `shadcn add` with `?v=...`).

---

## 2. Code Comment Convention

In addition to the lockfile, you can annotate the files that were generated from a registry component with a simple comment:

```ts
// cozy-registry: @owner/trading-button v0.2.1
```

### 2.1 Usage

- Put this comment at the top of the main TSX file that was imported into your project.
- Tools (or AI) can scan the project for lines starting with `// cozy-registry:` and extract:
  - `@owner/name`
  - `vX.Y.Z`

Combined with the `get_component_versions` MCP tool or the REST versions API, this allows automated checks such as:

- “You are using `@owner/trading-button v0.2.1`, but the latest is `v0.3.0`.”
- “Would you like to see the changelog or apply the upgrade?”

---

## 3. REST Versions API

The registry exposes a REST endpoint for versions:

```http
GET /api/registry/:owner/:name/versions
```

Response shape:

```json
{
  "currentVersion": "0.3.0",
  "versions": [
    {
      "version": "0.3.0",
      "createdAt": "2025-03-16T12:34:56.000Z",
      "createdBy": "user-id",
      "message": "Add loading state and outline variant"
    },
    {
      "version": "0.2.1",
      "createdAt": "2025-03-10T09:00:00.000Z",
      "createdBy": "user-id",
      "message": "Fix focus ring"
    }
  ]
}
```

Notes:

- `currentVersion` is the version that the registry considers “latest” for this item.
- Each version entry includes:
  - `version`: semantic version string.
  - `createdAt`: ISO timestamp.
  - `createdBy`: user id or null.
  - `message`: optional changelog/message from `createRegistryItemVersion`.

---

## 4. MCP Tools for Updates

For AI / MCP clients, the Cozy MCP server exposes:

### 4.1 `get_component`

- Now includes header metadata:

  ```text
  ## Trading Button (@owner/trading-button)

  A trading action button with loading state.

  - Current version: v0.2.1
  - Latest available: v0.3.0
  ```

- This lets tools immediately see if the fetched component is up to date.

### 4.2 `get_component_versions`

- Input:

  ```json
  {
    "name": "trading-button",
    "owner": "owner-id-or-legacy"
  }
  ```

- Output (text):

  ```text
  ## Versions for @owner/trading-button

  All versions (newest first):

  Latest: v0.3.0 (createdAt: 2025-03-16T12:34:56.000Z, message: Add loading state and outline variant)

  - v0.3.0 (createdAt: 2025-03-16T12:34:56.000Z, createdBy: user-id, message: Add loading state and outline variant)
  - v0.2.1 (createdAt: 2025-03-10T09:00:00.000Z, createdBy: user-id, message: Fix focus ring)
  - ...
  ```

Tools can combine:

- `cozy-registry.lock.json` or `// cozy-registry: ...` annotations
- `get_component_versions` or the REST versions API

to implement `check_updates`-style flows and guide users to upgrade components when newer versions are available.

