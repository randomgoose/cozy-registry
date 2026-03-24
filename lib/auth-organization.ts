import { createAccessControl, role } from "better-auth/plugins/access";

export const organizationAccessControl = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});

export const organizationRoles = {
  owner: organizationAccessControl.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
  }),
  // For the initial integration, editor/viewer are org-level roles without
  // management permissions. Cozy's team/resource permissions will layer on top.
  editor: role({}),
  viewer: role({}),
} as const;
