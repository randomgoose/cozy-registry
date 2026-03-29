import { fetchWorkspaceScopeContext, postAuthControl } from "./auth-control";

/** Align session with personal URLs (`/dashboard`, `/projects`, …). */
export async function syncPersonalWorkspaceSession(): Promise<void> {
  const ctx = await fetchWorkspaceScopeContext();
  if (!ctx) return;
  if (
    ctx.workspace.activeOrganizationId === null &&
    ctx.workspace.activeTeamId === null
  ) {
    return;
  }
  await postAuthControl("/organization/set-active-team", { teamId: null });
  await postAuthControl("/organization/set-active", { organizationId: null });
}

/**
 * Align session with `/w/:orgSlug/*`. Returns false if slug is unknown (caller should redirect).
 */
export async function syncOrgWorkspaceSessionFromSlug(orgSlug: string): Promise<boolean> {
  const ctx = await fetchWorkspaceScopeContext();
  if (!ctx) return false;
  const org = ctx.workspace.organizations.find((o) => o.slug === orgSlug);
  if (!org) return false;
  if (
    ctx.workspace.activeOrganizationId === org.id &&
    ctx.workspace.activeTeamId === null
  ) {
    return true;
  }
  await postAuthControl("/organization/set-active", { organizationId: org.id });
  await postAuthControl("/organization/set-active-team", { teamId: null });
  return true;
}
