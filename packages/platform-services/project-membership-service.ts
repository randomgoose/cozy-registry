import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@cozy/db";
import {
  invitation,
  member,
  organization,
  registryCollections,
  team,
  teamMember,
  user,
} from "@cozy/db/schema";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

type ProjectMembershipContext = Pick<PlatformRequestContext, "userId">;

export async function getProjectMembership(input: {
  context: ProjectMembershipContext;
  projectId: string;
}) {
  const { userId } = input.context;
  if (!userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const [project] = await db
    .select({
      id: registryCollections.id,
      slug: registryCollections.slug,
      title: registryCollections.title,
      visibility: registryCollections.visibility,
      ownerUserId: registryCollections.ownerUserId,
      ownerTeamId: registryCollections.ownerTeamId,
      createdAt: registryCollections.createdAt,
    })
    .from(registryCollections)
    .where(eq(registryCollections.id, input.projectId))
    .limit(1);

  if (!project) {
    return { status: 404, body: { error: "Not found" } };
  }

  if (project.ownerTeamId) {
    const [membership] = await db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, project.ownerTeamId),
          eq(teamMember.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      return { status: 404, body: { error: "Not found" } };
    }

    const [[teamRow], memberRows, invitationRows] = await Promise.all([
      db
        .select({
          id: team.id,
          name: team.name,
          slug: team.slug,
          organizationId: team.organizationId,
          organizationName: organization.name,
        })
        .from(team)
        .innerJoin(organization, eq(team.organizationId, organization.id))
        .where(eq(team.id, project.ownerTeamId))
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
            eq(member.organizationId, team.organizationId),
          ),
        )
        .innerJoin(team, eq(teamMember.teamId, team.id))
        .where(eq(teamMember.teamId, project.ownerTeamId))
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
        .innerJoin(team, eq(invitation.teamId, team.id))
        .where(
          and(
            eq(invitation.teamId, project.ownerTeamId),
            eq(invitation.organizationId, team.organizationId),
            eq(invitation.status, "pending"),
          ),
        )
        .orderBy(asc(invitation.createdAt)),
    ]);

    return {
      status: 200,
      body: {
        project,
        accessScope: {
          kind: "team" as const,
          team: teamRow ?? null,
        },
        members: memberRows,
        invitations: invitationRows,
      },
    };
  }

  const [owner] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(user)
    .where(
      and(
        eq(user.id, project.ownerUserId ?? ""),
        or(eq(user.id, userId), eq(registryCollections.visibility, "public")),
      ),
    )
    .limit(1);

  if (!owner || project.ownerUserId !== userId) {
    return { status: 404, body: { error: "Not found" } };
  }

  return {
    status: 200,
    body: {
      project,
      accessScope: {
        kind: "personal" as const,
      },
      members: [
        {
          memberId: `owner:${owner.id}`,
          id: owner.id,
          name: owner.name,
          email: owner.email,
          image: owner.image,
          role: "owner",
          joinedAt: project.createdAt,
        },
      ],
      invitations: [],
    },
  };
}
