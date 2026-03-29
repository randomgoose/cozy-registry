# DB Package

`packages/db` contains the shared Drizzle database runtime:

- `index.ts`: database client creation
- `schema.ts`: shared schema definitions

Repository-level migration and seed scripts remain under `lib/db/` for now, but they should import runtime pieces from `packages/db/*`.
