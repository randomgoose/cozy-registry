# Platform App

`apps/platform` is the runtime host for `cozy-platform`.

- `app.ts` wires HTTP routes and middleware.
- `server.ts` boots the Hono app on Node.
- `routes/*` stays intentionally thin and delegates business logic to shared packages.

Business logic should live in:

- `packages/platform-services/*`
- `packages/auth-control/*`
- `lib/*` for lower-level shared domain utilities
