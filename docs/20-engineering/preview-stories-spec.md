Status: proposed
Owner: engineering
Last updated: 2026-04-07
Source of truth: partial

# Preview Stories Spec (v1)

> Scope note:
> This document remains the source for per-item story metadata (`previewStories`, `previewDefaultStoryId`) and story-aware artifact identity.
> Component-level multi-story page behavior is now further defined in:
> - [Multi-Story Preview Page Spec](./multi-story-preview-page-spec.md)

This spec defines how registry items can provide explicit preview stories for robust rendering and fast artifact-backed preview delivery.

## 1. Goals

- Support explicit preview scenes for compound components (for example shadcn dropdown/menu).
- Prevent blank-yet-non-error previews caused by rendering non-visual root exports without children.
- Keep preview card/detail rendering fast by reusing prebuilt artifacts.
- Preserve backward compatibility with existing `previewExport` + `previewProps`.

## 2. Scope

Applies to non-theme registry items:

- `registry:ui`
- `registry:block`
- `registry:component` (legacy alias)

`registry:theme` keeps existing preview behavior and is out of scope for story switching.

## 3. Data Model (Meta-based, no new table)

Stories are stored in JSON meta on both snapshot and version records:

- `registry_items.meta`
- `registry_item_versions.meta`

### 3.1 Fields

```ts
type PreviewStory = {
  id: string; // unique per item-version, e.g. "default", "all-variants"
  title: string; // display label
  export?: string; // named export to render for this story
  props?: Record<string, unknown>; // JSON-serializable props
  description?: string;
  tags?: string[];
};

type PreviewStoryMeta = {
  previewStories?: PreviewStory[];
  previewDefaultStoryId?: string | null;
};
```

### 3.2 Validation Rules

- `previewStories[].id` must be non-empty and unique.
- `previewStories[].title` must be non-empty.
- `props` must be JSON-serializable.
- if `previewStories` is non-empty and `previewDefaultStoryId` is set, it must exist in the stories set.

## 4. Publish Contract

Extend publish input with optional fields:

- `previewStories?: PreviewStory[]`
- `previewDefaultStoryId?: string`

Existing fields remain valid:

- `previewExport`
- `previewProps`

### 4.1 Version Inheritance Semantics

For version updates:

- if `previewStories` is omitted: inherit from previous version
- if `previewStories` is provided: overwrite
- if `previewStories: []`: explicit clear
- same inheritance rule for `previewDefaultStoryId`

This keeps release flow ergonomic: authors do not need to resend stories on every patch.

## 5. Runtime Resolution Order

Preview runtime should resolve in this order:

1. story-scoped target (`story.export` + `story.props`) when a story is selected
2. component-scoped fallback (`meta.previewExport` + `meta.previewProps`)
3. default export
4. existing heuristic fallback

Story selection:

- `?story=<id>` query parameter (optional)
- if absent, use `previewDefaultStoryId`
- if absent again, use component-scoped fallback path

## 6. Artifact Build and Cache Keys

Artifact identity must include `storyId`:

- `storyId: string | null`

Rationale:

- avoid collisions between different visual scenes under one component version
- allow independent warm/cold behavior and invalidation per story

## 7. UI/UX Behavior

v1 minimum:

- Preview card uses default story (or legacy component fallback).
- Detail preview allows story selection (dropdown/tabs) and deep-link via `?story=`.

Error UX:

- unknown `story` id: return clear message (or fallback with debug warning)
- invalid `story.export`: return actionable render error with suggested exports

## 8. Smoke Gate Impact

For non-theme items:

- if stories exist: at least one story must be renderable
- if no stories: keep current smoke behavior
- diagnostics should suggest adding stories for compound components

## 9. Backward Compatibility

- Items without stories are unaffected.
- `previewExport` remains supported and should not be removed in v1.
- No data migration required to adopt this spec incrementally.

## 10. Rollout Plan

1. Add publish-time schema support for `previewStories` and `previewDefaultStoryId`.
2. Add version inheritance logic in create-version flow.
3. Add runtime story selection (`?story=`) with fallback chain.
4. Extend artifact key to include `storyId`.
5. Add story-aware prebundle enqueue policy (default story first).
6. Add detail-page story selector UI.

## 11. Acceptance Criteria

- Compound components (dropdown/menu/popover) can preview reliably without blank screens.
- Default story uses artifact-first fast path in preview card.
- Version updates inherit stories when omitted.
- Story-specific artifact keys prevent cross-story cache collisions.
