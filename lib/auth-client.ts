import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { organizationClient } from "better-auth/client/plugins";
import { organizationAccessControl, organizationRoles } from "./auth-organization";

export const authClient = createAuthClient({
  plugins: [
    apiKeyClient(),
    organizationClient({
      ac: organizationAccessControl,
      roles: organizationRoles,
    }),
  ],
});
