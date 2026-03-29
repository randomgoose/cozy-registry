# Cozy Registry

A source-native component registry for design-led teams, built for Vibe Coding and AI workflows.

## Features

- **Component browsing**: View, preview, and copy published components
- **Component publishing**: Paste TSX, add metadata, validate, and publish
- **AI integrations**: MCP tools for Cursor, Figma Make, and similar clients
- **shadcn-compatible output**: Emits standard registry format for shadcn CLI and related tooling

## Quick Start

### 1. Environment variables

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL
```

For local environment separation, we recommend keeping:

- `.env.dev` for the dev Supabase project
- `.env.prod` for the production Supabase project

Then use the explicit environment-aware scripts:

```bash
pnpm db:push:dev
pnpm db:push:prod
pnpm db:seed:dev
pnpm db:seed:prod
```

Each command prints the selected environment file, database host, and app URL before it runs.

### 2. Database

```bash
pnpm db:push
pnpm db:seed   # Seed example components
```

### 3. Start the app

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173)

Recommended local start:

```bash
pnpm cozy-platform
VITE_COZY_PLATFORM_BASE_URL=http://localhost:3000 \
pnpm cozy-web
```

Optional local stdio MCP server:

```bash
COZY_PLATFORM_BASE_URL=http://localhost:3000 \
pnpm cozy-mcp
```

Monorepo-wide task commands:

```bash
pnpm turbo:build
pnpm turbo:typecheck
pnpm turbo:lint
pnpm turbo:test
```

### 4. Optional: run the extracted platform host

```bash
pnpm cozy-platform
```

Default platform URL: [http://localhost:3000](http://localhost:3000)

If you want Web to consume the external platform host:

```bash
COZY_PLATFORM_BASE_URL=http://localhost:3000
```

More details:

- [Platform dev setup](docs/20-engineering/platform-dev-setup.md)
- [Deployment runbook](docs/20-engineering/deployment-runbook.md)
- [Repository structure guidelines](docs/20-engineering/repo-structure-guidelines.md)

Docs content now lives with the web host under `apps/web/content/docs/*`.
Database migration artifacts now live under `packages/db/migrations/*`.

Current migrated routes in `apps/web`:

- `/`
- `/sign-in`
- `/sign-up`
- `/post-auth`
- `/accept-invitation`
- `/onboarding/handle`
- `/dashboard`
- `/workspace`
- `/notifications`
- `/collections`
- `/registry`
- `/registry/:itemName`
- `/registry/:owner/:name`
- `/preview/:owner/:name`
- `/publish`
- `/settings`

If you want to preview the production build of the migrated host locally:

```bash
pnpm web:build
pnpm web:preview
```

More details:

- [Web framework migration plan](docs/20-engineering/web-framework-migration-plan.md)
- [Packages overview](packages/README.md)

## Deploy to Vercel

1. Push the project to GitHub, or deploy locally with `vercel`
2. Configure environment variables in your Vercel project:
   - `DATABASE_URL`: use [Vercel Postgres](https://vercel.com/storage/postgres), [Neon](https://neon.tech), [Supabase](https://supabase.com), or another Postgres provider
   - `APP_URL`: your deployed URL (for example `https://xxx.vercel.app`), used for MCP and registry links
   - `COZY_WEB_BASE_URL`: your deployed Web URL
   - `COZY_PLATFORM_BASE_URL`: your deployed platform URL
3. After deployment, connect to the production database locally and apply schema + seed data

### After the first deployment

Run schema updates and seed data against the remote database:

```bash
# Make sure DATABASE_URL in .env points to the production database
pnpm db:migrate-legacy   # If you have legacy data, migrate userId first
pnpm db:push
pnpm db:seed
```

## Thumbnail Worker

List-page thumbnails are not generated on demand during page requests. They are produced asynchronously by a separate worker.

### Required environment variables

- `DATABASE_URL`: used by the worker to read/write job records and registry metadata
- `APP_URL`: the public site URL, used when capturing `/preview/:owner/:name`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`, recommended value: `registry-thumbnails`

For local debugging, if Playwright cannot find a browser automatically, you can also set:

- `THUMBNAIL_BROWSER_EXECUTABLE_PATH`

### Run modes

Process a single job once:

```bash
pnpm cozy-thumbnail-worker --once
```

Run continuously in loop mode:

```bash
pnpm cozy-thumbnail-worker
```

### Recommended production deployment

Deploy the worker as a separate process in a Linux environment (for example Railway, Render, or DigitalOcean App Platform), separate from the web app running on Vercel:

- Web app: keep running on Vercel
- Thumbnail worker: separate service, preferably using `Dockerfile.worker`

On Railway, prefer Docker deployment for the worker instead of the default Node runtime. Thumbnail capture depends on Chromium and its system libraries, and the default runtime image may be missing those dependencies.

The worker container already:

- installs `chromium`
- sets `THUMBNAIL_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium`
- runs `pnpm run cozy-thumbnail-worker -- --loop` by default

Current worker behavior:

- `registry:theme`: generates a fixed template thumbnail
- `registry:block` / `registry:ui`: opens `/preview/...`, captures a screenshot, and uploads it to Supabase Storage

### First production checklist

1. Run `pnpm db:push`
2. Create the bucket `registry-thumbnails` in Supabase Storage
3. Publish a resource and confirm a `pending` job appears in `registry_asset_jobs`
4. Start the worker and confirm the job moves to `completed`
5. Confirm `registry_items.meta.thumbnail` is written and the list page prefers the thumbnail

## Documentation

- [Documentation index](docs/README.md)
- [Figma Make Quickstart](docs/user-guide/figma-make-quickstart.md)
- [Product summary](docs/00-overview/product-summary.md)
- [Product vision](docs/10-product/vision.md)
- [Roadmap](docs/10-product/roadmap.md)
- [Current TODOs](docs/40-delivery/todo.md)
- [Vibe Coding submission guidelines](docs/30-rules/submission-guidelines.md)
- [Figma Make MCP integration](docs/20-engineering/figma-make-mcp.md)
- [Setup guide](SETUP.md)
