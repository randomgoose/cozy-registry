# Registry Domain Package

`packages/registry-domain` contains Cozy Registry domain logic:

- owner resolution
- publish target resolution
- registry item read/write domain operations
- dependency graph parsing and validation
- publish contract normalization
- registry dependency resolution helpers and tests

This package intentionally keeps product-facing orchestration out of the domain layer. Route and application service code should stay in:

- `apps/platform/*`
- `packages/platform-services/*`
