import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, organization, team, teamMember } from "@/lib/db/schema";
import {
  ensureTeamSlug,
  parseTeamOwnerPath,
  resolveTeamByOrgSlugAndTeamSegment,
} from "@/lib/registry-team";

export type WritableTeamTarget = {
  kind: "team";
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  teamSlug: string;
  role: string;
  targetRef: string;
};

export type PersonalPublishTarget = {
  kind: "user";
  userId: string;
  label: string;
  targetRef: "personal";
};

export type PublishTarget = PersonalPublishTarget | WritableTeamTarget;

export type ResolvePublishTargetInput = {
  userId: string;
  publishScope?: "personal" | "team";
  targetRef?: string | null;
  organizationSlug?: string | null;
  teamSlug?: string | null;
  teamId?: string | null;
  activeTeamId?: string | null;
};

export type ResolvePublishTargetResult =
  | { ok: true; target: PublishTarget }
  | { ok: false; code: "NO_TEAM_TARGET" | "NO_TEAM_WRITE_ACCESS" | "AMBIGUOUS_TEAM_TARGET" | "INVALID_TEAM_TARGET"; message: string; candidates?: WritableTeamTarget[] };

export function canWriteTeamWithRole(role: string | null | undefined) {
  return role === "owner" || role === "editor";
}

function toPersonalPublishTarget(userId: string): PersonalPublishTarget {
  return {
    kind: "user",
    userId,
    label: "Personal",
    targetRef: "personal",
  };
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
      organizationName: organization.name,
      organizationSlug: organization.slug,
      teamSlug: team.slug,
      role: member.role,
    })
    .from(teamMember)
    .innerJoin(team, eq(teamMember.teamId, team.id))
    .innerJoin(organization, eq(team.organizationId, organization.id))
    .innerJoin(
      member,
      and(eq(member.userId, teamMember.userId), eq(member.organizationId, team.organizationId)),
    )
    .where(and(eq(teamMember.userId, userId), eq(team.id, teamId)))
    .limit(1);

  if (!row || !canWriteTeamWithRole(row.role)) return null;

  const teamSlug = row.teamSlug && row.teamSlug.trim().length > 0
    ? row.teamSlug
    : await ensureTeamSlug(row.id);
  if (!teamSlug) return null;

  return {
    kind: "team",
    id: row.id,
    name: row.name,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
    teamSlug,
    role: row.role,
    targetRef: `@${row.organizationSlug}/${teamSlug}`,
  };
}

export async function listWritablePublishTargetsForUser(
  userId: string,
): Promise<PublishTarget[]> {
  const rows = await db
    .select({
      id: team.id,
      name: team.name,
      organizationId: team.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      teamSlug: team.slug,
      role: member.role,
    })
    .from(teamMember)
    .innerJoin(team, eq(teamMember.teamId, team.id))
    .innerJoin(organization, eq(team.organizationId, organization.id))
    .innerJoin(
      member,
      and(eq(member.userId, teamMember.userId), eq(member.organizationId, team.organizationId)),
    )
    .where(eq(teamMember.userId, userId))
    .orderBy(asc(organization.name), asc(team.name));

  const teamTargets: WritableTeamTarget[] = [];
  for (const row of rows) {
    if (!canWriteTeamWithRole(row.role)) continue;
    const teamSlug = row.teamSlug && row.teamSlug.trim().length > 0
      ? row.teamSlug
      : await ensureTeamSlug(row.id);
    if (!teamSlug) continue;
    teamTargets.push({
      kind: "team",
      id: row.id,
      name: row.name,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      organizationSlug: row.organizationSlug,
      teamSlug,
      role: row.role,
      targetRef: `@${row.organizationSlug}/${teamSlug}`,
    });
  }

  return [toPersonalPublishTarget(userId), ...teamTargets];
}

async function resolveExplicitTeamTargetForUser(params: {
  userId: string;
  targetRef?: string | null;
  organizationSlug?: string | null;
  teamSlug?: string | null;
  teamId?: string | null;
}): Promise<WritableTeamTarget | null> {
  if (params.teamId) {
    return getWritableTeamTargetForUser(params.userId, params.teamId);
  }

  let organizationSlug = params.organizationSlug?.trim() ?? "";
  let teamSlug = params.teamSlug?.trim() ?? "";

  if (params.targetRef && params.targetRef.trim().length > 0) {
    const normalized = params.targetRef.trim().startsWith("@")
      ? params.targetRef.trim().slice(1)
      : params.targetRef.trim();
    const parsed = parseTeamOwnerPath(normalized);
    if (!parsed) return null;
    organizationSlug = parsed.orgSlug;
    teamSlug = parsed.teamSegment;
  }

  if (!organizationSlug || !teamSlug) return null;
  const resolved = await resolveTeamByOrgSlugAndTeamSegment(
    organizationSlug,
    teamSlug,
  );
  if (!resolved) return null;
  return getWritableTeamTargetForUser(params.userId, resolved.teamId);
}

export async function resolvePublishTargetForUser(
  params: ResolvePublishTargetInput,
): Promise<ResolvePublishTargetResult> {
  const scope = params.publishScope ?? "personal";
  if (scope === "personal") {
    return { ok: true, target: toPersonalPublishTarget(params.userId) };
  }

  const explicitTeamTarget = await resolveExplicitTeamTargetForUser({
    userId: params.userId,
    targetRef: params.targetRef,
    organizationSlug: params.organizationSlug,
    teamSlug: params.teamSlug,
    teamId: params.teamId,
  });
  const hasExplicitTeamInput =
    !!params.teamId ||
    !!params.targetRef?.trim() ||
    (!!params.organizationSlug?.trim() && !!params.teamSlug?.trim());

  if (hasExplicitTeamInput) {
    if (!explicitTeamTarget) {
      return {
        ok: false,
        code: "NO_TEAM_WRITE_ACCESS",
        message:
          "You do not have publish access to the selected team, or the team target is invalid.",
      };
    }
    return { ok: true, target: explicitTeamTarget };
  }

  if (params.activeTeamId) {
    const activeTarget = await getWritableTeamTargetForUser(
      params.userId,
      params.activeTeamId,
    );
    if (activeTarget) {
      return { ok: true, target: activeTarget };
    }
  }

  const writableTargets = (await listWritablePublishTargetsForUser(params.userId)).filter(
    (target): target is WritableTeamTarget => target.kind === "team",
  );

  if (writableTargets.length === 0) {
    return {
      ok: false,
      code: "NO_TEAM_WRITE_ACCESS",
      message:
        "You do not currently have publish access to any team. Create or join a team first, or publish to personal scope.",
    };
  }

  if (writableTargets.length === 1) {
    return { ok: true, target: writableTargets[0] };
  }

  return {
    ok: false,
    code: "AMBIGUOUS_TEAM_TARGET",
    message:
      "You can publish to multiple teams. Choose one explicitly using targetRef like @org/team.",
    candidates: writableTargets,
  };
}
