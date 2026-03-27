import { and, eq, ne } from "drizzle-orm";

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
    .select({ id: team.id, name: team.name, slug: team.slug })
    .from(team)
    .where(eq(team.organizationId, orgRow.id));

  const seg = teamSegment.toLowerCase();
  const bySlug = teams.find((row) => (row.slug ?? "").toLowerCase() === seg);
  if (bySlug) {
    return {
      teamId: bySlug.id,
      organizationId: orgRow.id,
      teamName: bySlug.name,
      orgSlug: orgRow.slug,
    };
  }

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

export async function buildUniqueTeamSlug(params: {
  organizationId: string;
  name: string;
  excludeTeamId?: string;
}): Promise<string> {
  const base = slugifyRegistrySegment(params.name) || "team";
  let candidate = base;
  let attempt = 1;

  while (true) {
    const query = db
      .select({ id: team.id })
      .from(team)
      .where(
        params.excludeTeamId
          ? and(
              eq(team.organizationId, params.organizationId),
              eq(team.slug, candidate),
              ne(team.id, params.excludeTeamId),
            )
          : and(eq(team.organizationId, params.organizationId), eq(team.slug, candidate)),
      )
      .limit(1);
    const [existing] = await query;
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

export async function ensureTeamSlug(teamId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: team.id,
      organizationId: team.organizationId,
      name: team.name,
      slug: team.slug,
    })
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);
  if (!row) return null;
  if (row.slug && row.slug.trim().length > 0) return row.slug;

  const slug = await buildUniqueTeamSlug({
    organizationId: row.organizationId,
    name: row.name,
    excludeTeamId: row.id,
  });

  await db.update(team).set({ slug }).where(eq(team.id, row.id));
  return slug;
}

/** Canonical MCP/ref prefix for a team: `orgSlug/slugify(teamName)` (no leading @). */
export async function getTeamCanonicalOwnerRef(teamId: string): Promise<string | null> {
  const [row] = await db
    .select({
      orgSlug: organization.slug,
      teamName: team.name,
      teamSlug: team.slug,
    })
    .from(team)
    .innerJoin(organization, eq(team.organizationId, organization.id))
    .where(eq(team.id, teamId))
    .limit(1);
  if (!row) return null;
  const slug = row.teamSlug && row.teamSlug.trim().length > 0
    ? row.teamSlug
    : await ensureTeamSlug(teamId);
  return `${row.orgSlug}/${slug ?? slugifyRegistrySegment(row.teamName)}`;
}
