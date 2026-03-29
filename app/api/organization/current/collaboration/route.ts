import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitation, member, organization, user } from "@/lib/db/schema";

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
      organization: null,
      members: [],
      invitations: [],
    });
  }

  const [[roleRow], [orgRow], memberRows, invitationRows] = await Promise.all([
    db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, activeOrganizationId)))
      .limit(1),
    db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, activeOrganizationId))
      .limit(1),
    db
      .select({
        memberId: member.id,
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: member.role,
        joinedAt: member.createdAt,
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
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, activeOrganizationId),
          isNull(invitation.teamId),
          eq(invitation.status, "pending"),
        ),
      )
      .orderBy(asc(invitation.createdAt)),
  ]);

  return NextResponse.json({
    activeOrganizationId,
    role: roleRow?.role ?? null,
    organization: orgRow ?? null,
    members: memberRows,
    invitations: invitationRows,
  });
}
