# Preview Package

`packages/preview` contains preview runtime helpers and cache logic:

- preview bundle building
- preview build cache and workspace keys
- preview message contracts
- simple preview prop control helpers

Platform orchestration that consumes these helpers should stay in `packages/platform-services/preview-service.ts`.
