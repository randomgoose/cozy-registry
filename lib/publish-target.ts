import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, team, teamMember } from "@/lib/db/schema";

export type WritableTeamTarget = {
  kind: "team";
  id: string;
  name: string;
  organizationId: string;
  role: string;
};

export type PersonalPublishTarget = {
  kind: "user";
  userId: string;
};

export type PublishTarget = PersonalPublishTarget | WritableTeamTarget;

export function canWriteTeamWithRole(role: string | null | undefined) {
  return role === "owner" || role === "editor";
}

export async function getWritableTeamTargetForUser(
  userId: string,
  teamId: string,
): Promise<WritableTeamTarget | null> {
  const [row] = await db
    .select({
      id: team.id,
      name: team.name,
      organizationId: team.organizationId,
      role: member.role,
    })
    .from(teamMember)
    .innerJoin(team, eq(teamMember.teamId, team.id))
    .innerJoin(
      member,
      and(eq(member.userId, teamMember.userId), eq(member.organizationId, team.organizationId)),
    )
    .where(and(eq(teamMember.userId, userId), eq(team.id, teamId)))
    .limit(1);

  if (!row || !canWriteTeamWithRole(row.role)) return null;

  return {
    kind: "team",
    id: row.id,
    name: row.name,
    organizationId: row.organizationId,
    role: row.role,
  };
}

