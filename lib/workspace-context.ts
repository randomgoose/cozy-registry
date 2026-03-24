import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, organization, team, teamMember } from "@/lib/db/schema";

type SessionLike =
  | {
      user?: { id?: string | null } | null;
      session?: {
        activeOrganizationId?: string | null;
        activeTeamId?: string | null;
      } | null;
    }
  | null
  | undefined;

export type WorkspaceTeam = {
  id: string;
  name: string;
  organizationId: string;
  isActive: boolean;
};

export type WorkspaceOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  teams: WorkspaceTeam[];
  isActive: boolean;
};

export type WorkspaceContext = {
  organizations: WorkspaceOrganization[];
  activeOrganizationId: string | null;
  activeTeamId: string | null;
  activeOrganization: WorkspaceOrganization | null;
  activeTeam: WorkspaceTeam | null;
};

function emptyWorkspaceContext(): WorkspaceContext {
  return {
    organizations: [],
    activeOrganizationId: null,
    activeTeamId: null,
    activeOrganization: null,
    activeTeam: null,
  };
}

export async function getWorkspaceContextForSession(
  session: SessionLike,
): Promise<WorkspaceContext> {
  const userId = session?.user?.id ?? null;
  if (!userId) return emptyWorkspaceContext();

  const [organizationRows, teamRows] = await Promise.all([
    db
      .select({
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .orderBy(asc(organization.name)),
    db
      .select({
        teamId: team.id,
        teamName: team.name,
        organizationId: team.organizationId,
      })
      .from(teamMember)
      .innerJoin(team, eq(teamMember.teamId, team.id))
      .where(eq(teamMember.userId, userId))
      .orderBy(asc(team.name)),
  ]);

  if (organizationRows.length === 0) return emptyWorkspaceContext();

  const activeOrganizationIdFromSession = session?.session?.activeOrganizationId ?? null;
  const activeTeamIdFromSession = session?.session?.activeTeamId ?? null;

  const organizations = organizationRows.map((row) => ({
    id: row.organizationId,
    name: row.organizationName,
    slug: row.organizationSlug,
    role: row.role,
    teams: teamRows
      .filter((teamRow) => teamRow.organizationId === row.organizationId)
      .map((teamRow) => ({
        id: teamRow.teamId,
        name: teamRow.teamName,
        organizationId: teamRow.organizationId,
        isActive: false,
      })),
    isActive: false,
  }));

  const activeOrganization =
    organizations.find((item) => item.id === activeOrganizationIdFromSession) ??
    organizations[0] ??
    null;

  const activeTeam =
    activeOrganization?.teams.find((item) => item.id === activeTeamIdFromSession) ??
    activeOrganization?.teams[0] ??
    null;

  const hydratedOrganizations = organizations.map((item) => ({
    ...item,
    isActive: item.id === activeOrganization?.id,
    teams: item.teams.map((candidate) => ({
      ...candidate,
      isActive: candidate.id === activeTeam?.id,
    })),
  }));

  return {
    organizations: hydratedOrganizations,
    activeOrganizationId: activeOrganization?.id ?? null,
    activeTeamId: activeTeam?.id ?? null,
    activeOrganization:
      hydratedOrganizations.find((item) => item.id === activeOrganization?.id) ?? null,
    activeTeam:
      hydratedOrganizations
        .flatMap((item) => item.teams)
        .find((item) => item.id === activeTeam?.id) ?? null,
  };
}

export async function getUserOrganizationRole(
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);

  return row?.role ?? null;
}
