import { and, asc, eq } from "drizzle-orm";
import { db } from "@cozy/db";
import {
  invitation,
  member,
  organization,
  team,
  teamMember,
  user,
} from "@cozy/db/schema";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

type TeamCollaborationContext = Pick<
  PlatformRequestContext,
  "userId" | "activeOrganizationId" | "activeTeamId"
>;

export async function getCurrentTeamCollaboration(input: {
  context: TeamCollaborationContext;
}) {
  const { userId, activeOrganizationId, activeTeamId } = input.context;
  if (!userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  if (!activeOrganizationId || !activeTeamId) {
    return {
      status: 200,
      body: {
        activeOrganizationId: null,
        activeTeamId: null,
        role: null,
        team: null,
        members: [],
        invitations: [],
      },
    };
  }

  const [[roleRow], [teamRow], memberRows, invitationRows] = await Promise.all([
    db
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.userId, userId), eq(member.organizationId, activeOrganizationId)),
      )
      .limit(1),
    db
      .select({
        id: team.id,
        name: team.name,
        organizationId: team.organizationId,
        organizationName: organization.name,
      })
      .from(team)
      .innerJoin(organization, eq(team.organizationId, organization.id))
      .where(
        and(eq(team.id, activeTeamId), eq(team.organizationId, activeOrganizationId)),
      )
      .limit(1),
    db
      .select({
        memberId: member.id,
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: member.role,
        joinedAt: teamMember.createdAt,
      })
      .from(teamMember)
      .innerJoin(user, eq(teamMember.userId, user.id))
      .innerJoin(
        member,
        and(
          eq(member.userId, teamMember.userId),
          eq(member.organizationId, activeOrganizationId),
        ),
      )
      .where(eq(teamMember.teamId, activeTeamId))
      .orderBy(asc(user.name), asc(user.email)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, activeOrganizationId),
          eq(invitation.teamId, activeTeamId),
          eq(invitation.status, "pending"),
        ),
      )
      .orderBy(asc(invitation.createdAt)),
  ]);

  return {
    status: 200,
    body: {
      activeOrganizationId,
      activeTeamId,
      role: roleRow?.role ?? null,
      team: teamRow ?? null,
      members: memberRows,
      invitations: invitationRows,
    },
  };
}
