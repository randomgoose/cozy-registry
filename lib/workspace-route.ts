import { cache } from "react";

import { isUserOrganizationMember, resolveOrganizationBySlug } from "@/lib/registry-organization";

export type WorkspaceRouteAccess = {
  org: {
    id: string;
    slug: string;
    name: string;
  } | null;
  isMember: boolean;
  timingsMs: {
    organizationResolution: number;
    membershipCheck: number;
  };
};

export const getCachedWorkspaceRouteAccess = cache(
  async (userId: string, rawSlug: string): Promise<WorkspaceRouteAccess> => {
    const slug = decodeURIComponent(rawSlug);

    let stepStartedAt = performance.now();
    const org = await resolveOrganizationBySlug(slug);
    const organizationResolution =
      Math.round((performance.now() - stepStartedAt) * 100) / 100;

    if (!org) {
      return {
        org: null,
        isMember: false,
        timingsMs: {
          organizationResolution,
          membershipCheck: 0,
        },
      };
    }

    stepStartedAt = performance.now();
    const isMember = await isUserOrganizationMember(userId, org.id);
    const membershipCheck =
      Math.round((performance.now() - stepStartedAt) * 100) / 100;

    return {
      org,
      isMember,
      timingsMs: {
        organizationResolution,
        membershipCheck,
      },
    };
  },
);
