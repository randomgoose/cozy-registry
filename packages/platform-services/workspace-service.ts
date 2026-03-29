import { and, asc, eq } from "drizzle-orm";
import { db } from "@cozy/db";
import {
  invitation,
  member,
  organization,
  team,
  user,
} from "@cozy/db/schema";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

type WorkspaceContext = Pick<
  PlatformRequestContext,
  "userId" | "activeOrganizationId"
>;

export async function getCurrentWorkspace(input: {
  context: WorkspaceContext;
}) {
  const { userId, activeOrganizationId } = input.context;
  if (!userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  if (!activeOrganizationId) {
    return {
      status: 200,
      body: {
        activeOrganizationId: null,
        role: null,
        workspace: null,
        teams: [],
        members: [],
        invitations: [],
      },
    };
  }

  const [[roleRow], [workspaceRow], teamRows, memberRows, invitationRows] =
    await Promise.all([
      db
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.userId, userId),
            eq(member.organizationId, activeOrganizationId),
          ),
        )
        .limit(1),
      db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          createdAt: organization.createdAt,
          logo: organization.logo,
        })
        .from(organization)
        .where(eq(organization.id, activeOrganizationId))
        .limit(1),
      db
        .select({
          id: team.id,
          name: team.name,
          slug: team.slug,
          createdAt: team.createdAt,
        })
        .from(team)
        .where(eq(team.organizationId, activeOrganizationId))
        .orderBy(asc(team.name)),
      db
        .select({
          memberId: member.id,
          id: user.id,
          name: user.name,
          email: user.email,
          role: member.role,
          image: user.image,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(eq(member.organizationId, activeOrganizationId))
        .orderBy(asc(user.name), asc(user.email)),
      db
        .select({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          teamId: invitation.teamId,
          teamName: team.name,
          createdAt: invitation.createdAt,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .leftJoin(team, eq(invitation.teamId, team.id))
        .where(
          and(
            eq(invitation.organizationId, activeOrganizationId),
            eq(invitation.status, "pending"),
          ),
        )
        .orderBy(asc(invitation.createdAt)),
    ]);

  return {
    status: 200,
    body: {
      activeOrganizationId,
      role: roleRow?.role ?? null,
      workspace: workspaceRow ?? null,
      teams: teamRows,
      members: memberRows,
      invitations: invitationRows,
    },
  };
}
