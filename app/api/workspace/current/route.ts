import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitation, member, organization, team, user } from "@/lib/db/schema";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!activeOrganizationId) {
    return NextResponse.json({
      activeOrganizationId: null,
      role: null,
      workspace: null,
      teams: [],
      members: [],
      invitations: [],
    });
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

  return NextResponse.json({
    activeOrganizationId,
    role: roleRow?.role ?? null,
    workspace: workspaceRow ?? null,
    teams: teamRows,
    members: memberRows,
    invitations: invitationRows,
  });
}
