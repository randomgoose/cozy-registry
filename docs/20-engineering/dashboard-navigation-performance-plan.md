Status: proposed
Owner: engineering
Last updated: 2026-04-02
Source of truth: yes

# Dashboard Navigation Performance Plan

This document defines the near-term optimization plan for slow navigation in the authenticated dashboard / workspace experience.

The goal is to improve perceived page transitions **without** requiring an immediate framework migration or major platform extraction.

---

## 1. Problem Statement

The authenticated dashboard experience currently feels slower than it should during route transitions.

This is not caused by a single hotspot. The slow feel appears to come from several overlapping behaviors:

1. page-entry scope synchronization writes session state and then refreshes the route
2. authenticated layout work re-runs on those refreshes
3. workspace route layout and page repeat organization membership resolution
4. project-related screens still rely on client-side `fetch(..., { cache: "no-store" })`
5. some sidebar/project data is fetched separately from main page data

The result is avoidable extra work during route changes and worse perceived navigation latency.

---

## 2. Goals

This plan MUST:

1. reduce unnecessary route refreshes during authenticated navigation
2. reduce duplicated server-side organization/session queries
3. reduce repeated client-side project list fetches
4. improve user-perceived dashboard navigation speed
5. add enough observability to confirm the real bottlenecks

Non-goals:

- replacing Next.js right now
- redesigning the dashboard UI
- changing authorization semantics
- performing the API/service extraction as part of this work

---

## 3. Main Suspected Bottlenecks

## 3.1 Scope sync forces route refresh

The following components currently perform a write to `/api/auth/organization/set-active` on mount and then call `router.refresh()`:

- `app/(auth)/workspace/[slug]/WorkspaceScopeSync.tsx`
- `app/(auth)/me/PersonalScopeSync.tsx`

This is likely the single most expensive navigation-pattern issue because:

- it adds an extra write request on entry
- it triggers a route refresh
- the refresh causes authenticated server layout and page work to run again

### Optimization direction

- convert page-entry sync from **always run** to **only when scope is actually wrong**
- prefer user-initiated scope switching as the primary place to mutate active scope
- keep page-entry sync only as a deep-link fallback

## 3.2 Auth layout re-runs expensive work

`app/(auth)/layout.tsx` is dynamic and resolves:

- session
- user handle
- workspace context

This is structurally acceptable, but it becomes expensive when unnecessary route refreshes keep retriggering it.

### Optimization direction

- reduce refresh frequency first
- keep layout shell data cached aggressively where safe
- avoid introducing more dynamic work in the auth layout

## 3.3 Workspace slug layout and page repeat checks

The workspace slug layout and page both perform overlapping work:

- resolve organization by slug
- check membership

Files:

- `app/(auth)/workspace/[slug]/layout.tsx`
- `app/(auth)/workspace/[slug]/page.tsx`

### Optimization direction

- resolve and authorize once in the layout
- pass the resolved organization information down
- avoid repeating the same membership lookup in the page

## 3.4 Project data is fetched more than once

Project-oriented screens still rely on client-side fetches for data that often could be:

- server-provided initially
- shared between page and shell/sidebar

Files:

- `app/(auth)/dashboard/CollectionsPanel.tsx`
- `app/(auth)/AppShell.tsx`
- `app/api/projects/route.ts`

Observed issues:

- `ProjectsPanel` fetches `/api/projects` with `cache: "no-store"`
- `AppShell` separately fetches `/api/projects` again for sidebar project navigation in detail flows

### Optimization direction

- move project list to server-first loading for initial render
- hydrate the client with initial data
- avoid shell/sidebar re-fetching project lists already known to the page

---

## 4. Optimization Strategy

Work should be executed in this order:

1. eliminate unnecessary scope-sync refreshes
2. remove duplicated workspace slug resolution
3. reduce client-side repeated project fetches
4. instrument timings to validate gains

This order prioritizes perceived UX wins over deeper structural cleanup.

---

## 5. Phase 1: Scope Sync Optimization (Highest Priority)

### 5.1 Current behavior to change

Current pattern:

- route mounts
- sync component posts active organization change
- route refreshes

This should not happen on every entry if scope is already correct.

### 5.2 Required changes

#### `app/(auth)/workspace/[slug]/WorkspaceScopeSync.tsx`

Change behavior to:

- receive enough information to know whether the active organization already matches the route
- only call `/api/auth/organization/set-active` when there is a mismatch
- only call `router.refresh()` after a successful mutation that actually changed scope

#### `app/(auth)/me/PersonalScopeSync.tsx`

Change behavior to:

- only clear active organization when one is actually active
- do not refresh if the session is already in personal scope

### 5.3 Design note

The preferred source of truth for workspace switching should remain the explicit workspace switcher:

- `app/components/WorkspaceScopeSwitcher.tsx`

Page-entry scope sync should become a fallback for deep links, not the normal path for every navigation.

### 5.4 Acceptance

- navigating between dashboard routes in the same scope does not trigger extra write + refresh work
- entering `/workspace/[slug]` or `/me` only syncs when scope is actually incorrect

---

## 6. Phase 2: Workspace Route De-duplication

### 6.1 Problem

These files currently perform overlapping org lookup / permission work:

- `app/(auth)/workspace/[slug]/layout.tsx`
- `app/(auth)/workspace/[slug]/page.tsx`

### 6.2 Required changes

- move organization resolution and membership validation into the layout
- expose the resolved organization to child page logic
- remove duplicate org/member checks from the page

### 6.3 Acceptable implementation options

Any of the following are acceptable:

- layout passes data through a wrapper/component prop
- shared cached helper is introduced and reused by both
- route-specific context is introduced

The key requirement is: **the expensive checks should not run twice for the same request path**.

### 6.4 Acceptance

- workspace page load performs organization resolution once
- membership validation is not duplicated between layout and page

---

## 7. Phase 3: Project Data Fetch Optimization

### 7.1 Current problem

Project data is still primarily client-fetched:

- `ProjectsPanel` fetches `/api/projects`
- `AppShell` may also fetch `/api/projects` again for sidebar display

This causes:

- slower first meaningful view
- repeated network calls
- duplicated loading states

### 7.2 Required changes

#### `app/(auth)/me/projects/page.tsx`

- fetch initial project list on the server
- pass the result into the client panel as initial data

#### `app/(auth)/dashboard/CollectionsPanel.tsx`

- accept server-provided initial project data
- only re-fetch when explicit refresh is needed
- avoid unconditional first-render client fetch when initial data already exists

#### `app/(auth)/AppShell.tsx`

- stop fetching `/api/projects` solely for sidebar support when the page already has the relevant list
- prefer props/context/hydrated cache over a second client fetch

### 7.3 Acceptance

- project pages render with usable initial data immediately
- project detail flows do not trigger redundant `/api/projects` fetches for both main panel and sidebar

---

## 8. Phase 4: Observability / Timing

This phase should be started early, but can be refined alongside the previous phases.

### 8.1 Required timing instrumentation

Add timing logs around:

#### `app/(auth)/layout.tsx`

- session lookup
- user handle lookup
- workspace context load
- total layout time

#### `app/(auth)/workspace/[slug]/layout.tsx`

- organization resolution
- membership check

#### `app/(auth)/workspace/[slug]/page.tsx`

- registry item load
- page total time

#### `app/api/projects/route.ts`

- scope resolution
- project list query
- item counts query
- preview items query
- total route time

### 8.2 Goal

Optimization should be measured, not guessed.

The team should be able to answer:

- how often scope sync actually mutates state
- whether route refreshes decreased
- whether repeated org/project queries were removed

---

## 9. Suggested Agent Breakdown

### Agent 1: Scope Sync

Files:

- `app/(auth)/workspace/[slug]/WorkspaceScopeSync.tsx`
- `app/(auth)/me/PersonalScopeSync.tsx`
- `app/components/WorkspaceScopeSwitcher.tsx`
- `app/(auth)/layout.tsx`

Deliverable:

- conditional scope sync with minimal refresh behavior

### Agent 2: Workspace Route De-duplication

Files:

- `app/(auth)/workspace/[slug]/layout.tsx`
- `app/(auth)/workspace/[slug]/page.tsx`
- optional helper in `lib/registry-organization.ts`

Deliverable:

- org resolution / membership check runs once per workspace route request

### Agent 3: Project Data Flow

Files:

- `app/(auth)/me/projects/page.tsx`
- `app/(auth)/dashboard/CollectionsPanel.tsx`
- `app/(auth)/AppShell.tsx`
- `app/api/projects/route.ts`

Deliverable:

- server-first project list loading
- reduced duplicate project fetches

### Agent 4: Instrumentation

Files:

- `app/(auth)/layout.tsx`
- `app/(auth)/workspace/[slug]/layout.tsx`
- `app/(auth)/workspace/[slug]/page.tsx`
- `app/api/projects/route.ts`

Deliverable:

- timing logs or profiling data for the slow navigation path

---

## 10. Acceptance Criteria

This optimization pass is successful when:

1. navigating between authenticated dashboard routes no longer triggers unnecessary scope-sync refreshes
2. workspace slug route no longer repeats org/member resolution in both layout and page
3. project routes no longer rely on redundant duplicate `/api/projects` fetches
4. authenticated navigation feels materially faster to humans
5. timing instrumentation confirms a real reduction in repeated work

---

## 11. One-sentence rule

**Treat slow dashboard navigation as a repeated-work problem first, not as a rendering-framework problem first.**
