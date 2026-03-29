import { createAccessControl, role } from "better-auth/plugins/access";

export const organizationAccessControl = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  ac: ["create", "read", "update", "delete"],
});

export const organizationRoles = {
  owner: organizationAccessControl.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    ac: ["create", "read", "update", "delete"],
  }),
  editor: role({}),
  viewer: role({}),
} as const;
