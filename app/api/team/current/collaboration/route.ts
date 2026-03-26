import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitation, member, organization, team, teamMember, user } from "@/lib/db/schema";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  const activeOrganizationId = session?.session?.activeOrganizationId ?? null;
  const activeTeamId = session?.session?.activeTeamId ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!activeOrganizationId || !activeTeamId) {
    return NextResponse.json({
      activeOrganizationId: null,
      activeTeamId: null,
      role: null,
      team: null,
      members: [],
      invitations: [],
    });
  }

  const [[roleRow], [teamRow], memberRows, invitationRows] = await Promise.all([
    db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, activeOrganizationId)))
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
      .where(and(eq(team.id, activeTeamId), eq(team.organizationId, activeOrganizationId)))
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
        and(eq(member.userId, teamMember.userId), eq(member.organizationId, activeOrganizationId)),
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

  return NextResponse.json({
    activeOrganizationId,
    activeTeamId,
    role: roleRow?.role ?? null,
    team: teamRow ?? null,
    members: memberRows,
    invitations: invitationRows,
  });
}
