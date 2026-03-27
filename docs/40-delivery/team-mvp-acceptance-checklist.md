Status: draft
Owner: shared
Last updated: 2026-03-27
Source of truth: yes

# Team MVP Acceptance Checklist

Use this checklist for end-to-end validation of the current team/workspace MVP before broader testing.

## 1. Workspace Creation

- [ ] A signed-in user with no organization can open the workspace switcher.
- [ ] The switcher shows `Create workspace`.
- [ ] Creating a workspace succeeds.
- [ ] A default team is created automatically.
- [ ] The new workspace appears in the switcher immediately after refresh.
- [ ] The new team becomes selectable.

## 2. Team Creation

- [ ] Inside an existing workspace, the switcher shows `Create team`.
- [ ] Creating a team succeeds.
- [ ] The creating user is automatically added to the new team.
- [ ] The new team gets a stable slug.
- [ ] The new team becomes the active team after creation.
- [ ] The new team is visible in the switcher without manual reload issues.

## 3. Scope Switching

- [ ] Switching from `Personal` to a team succeeds.
- [ ] Switching from a team back to `Personal` succeeds.
- [ ] The active scope label updates correctly.
- [ ] The dashboard content changes with the selected scope.
- [ ] The collections page changes with the selected scope.
- [ ] The settings page changes with the selected scope.

## 4. Dashboard Behavior

### Personal scope

- [ ] `My items` shows the signed-in user's personal items.
- [ ] Personal stats reflect only personal items.
- [ ] Personal empty state is shown when there are no personal items.

### Team scope

- [ ] Team dashboard shows items owned by the active team.
- [ ] Team stats reflect only team-owned items.
- [ ] Team empty state is shown when there are no team items.
- [ ] Team dashboard copy refers to the active team/workspace instead of personal ownership.

## 5. Collections Behavior

### Personal scope

- [ ] Personal collections still list and create correctly.
- [ ] Personal collections only allow personal items to be added.

### Team scope

- [ ] Team collections list correctly for the active team.
- [ ] A new collection created in team scope is owned by the active team.
- [ ] Team collections only allow items from the same team.
- [ ] Personal items cannot be added to a team collection.

## 6. Settings Behavior

### Personal scope

- [ ] Personal settings still load normally.
- [ ] User API keys and user-scoped policy controls still work.

### Team scope

- [ ] The page shows the current active team scope clearly.
- [ ] The `Team workspace` section appears.
- [ ] The current organization and role are shown.
- [ ] Team name can be updated by an owner.
- [ ] Updated team name is reflected in the switcher.

## 7. Team Members and Invites

- [ ] Team members list loads in team scope.
- [ ] Pending invitations list loads in team scope.
- [ ] An owner can send an invite.
- [ ] A new invite appears in the pending invitations list.
- [ ] An owner can cancel a pending invite.
- [ ] An owner can change a member role between `viewer` and `editor`.
- [ ] An owner can remove a member from the active team.
- [ ] A non-owner cannot see or use owner-only controls.

## 8. Team Publish

### REST

- [ ] Creating a new item with `publishScope: "team"` and `teamId` succeeds for an owner/editor.
- [ ] The created item is stored with `registry_items.team_id`.
- [ ] A viewer or non-member cannot publish to that team.

### MCP

- [ ] `publish_component` accepts `publishScope: "team"` and `teamId`.
- [ ] Publishing a new team item succeeds for an owner/editor.
- [ ] Republishing the same item updates the existing team item instead of creating a duplicate.
- [ ] Error messages are clear when publish access is missing.

## 9. Team Read Paths

- [ ] `list_components` with `teamId` lists the active team's catalog.
- [ ] Team refs are shown as `@orgSlug/teamSlug/itemName`.
- [ ] `get_component` can resolve a team-owned item by `orgSlug/teamSlug`.
- [ ] Team versions can be fetched from `/api/registry/{orgSlug}/{teamSlug}/{name}/versions`.
- [ ] Team bundles can be fetched from `/api/r/{orgSlug}/{teamSlug}/{name}`.

## 10. Team Item Management

- [ ] Team item metadata can be fetched from `/api/registry/{orgSlug}/{teamSlug}/{name}`.
- [ ] Team item visibility can be updated through the team route.
- [ ] Team item delete works through the team route.
- [ ] MCP delete can target a team-owned item.
- [ ] If a team item is still referenced by `registryDependencies`, delete is blocked with a clear message.

## 11. Dependency and Access Semantics

- [ ] Private team dependencies return a permission-style failure, not a false `not found`.
- [ ] Team read/install paths use the persisted team slug, not only `slugify(team.name)` at read time.
- [ ] Team refs remain stable after a team rename.

## 12. Regression Checks

- [ ] Personal publish still works.
- [ ] Personal item delete still works.
- [ ] Personal item visibility update still works.
- [ ] Existing MCP read/install behavior for personal items still works.
- [ ] Preview and thumbnail generation still work for personal items.
- [ ] Preview and thumbnail generation still work for team items where applicable.

## 13. Environment Checks

- [ ] The full checklist passes in dev.
- [ ] The full checklist passes in prod.
- [ ] Dev and prod produce the same team ref format.
- [ ] No environment-specific auth or scope switching regressions appear.
