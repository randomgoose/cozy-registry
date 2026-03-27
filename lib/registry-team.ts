import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { organization, team, teamMember } from "@/lib/db/schema";

/** Slug for URL / ref segments (matches WorkspaceScopeSwitcher slugify for names). */
export function slugifyRegistrySegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Team owner path is `orgSlug/teamSegment` where teamSegment is slugify(team.name).
 * Single-segment owners stay personal (handled by resolveOwner).
 */
export function parseTeamOwnerPath(ownerId: string): { orgSlug: string; teamSegment: string } | null {
  const t = ownerId.trim();
  const idx = t.indexOf("/");
  if (idx <= 0 || idx === t.length - 1) return null;
  const orgSlug = t.slice(0, idx).trim();
  const teamSegment = t.slice(idx + 1).trim();
  if (!orgSlug || !teamSegment || orgSlug.includes("/") || teamSegment.includes("/")) return null;
  return { orgSlug, teamSegment };
}

export async function resolveTeamByOrgSlugAndTeamSegment(
  orgSlug: string,
  teamSegment: string,
): Promise<{ teamId: string; organizationId: string; teamName: string; orgSlug: string } | null> {
  const [orgRow] = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .where(eq(organization.slug, orgSlug))
    .limit(1);
  if (!orgRow) return null;

  const teams = await db
    .select({ id: team.id, name: team.name })
    .from(team)
    .where(eq(team.organizationId, orgRow.id));

  const seg = teamSegment.toLowerCase();
  for (const row of teams) {
    if (slugifyRegistrySegment(row.name) === seg || row.name.toLowerCase() === seg) {
      return {
        teamId: row.id,
        organizationId: orgRow.id,
        teamName: row.name,
        orgSlug: orgRow.slug,
      };
    }
  }
  return null;
}

export async function isUserTeamMember(userId: string, teamId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.userId, userId), eq(teamMember.teamId, teamId)))
    .limit(1);
  return !!row;
}

/** Canonical MCP/ref prefix for a team: `orgSlug/slugify(teamName)` (no leading @). */
export async function getTeamCanonicalOwnerRef(teamId: string): Promise<string | null> {
  const [row] = await db
    .select({
      orgSlug: organization.slug,
      teamName: team.name,
    })
    .from(team)
    .innerJoin(organization, eq(team.organizationId, organization.id))
    .where(eq(team.id, teamId))
    .limit(1);
  if (!row) return null;
  return `${row.orgSlug}/${slugifyRegistrySegment(row.teamName)}`;
}
