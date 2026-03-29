import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";

import { resolveTeamByOrgSlugAndTeamSegment } from "@/lib/registry-team";

export async function resolveOrganizationBySlug(slug: string) {
  const key = slug.trim();
  if (!key) return null;
  const [exact] = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
    })
    .from(organization)
    .where(eq(organization.slug, key))
    .limit(1);
  if (exact) return exact;

  const keyLower = key.toLowerCase();
  const ciMatches = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
    })
    .from(organization)
    .where(sql`lower(${organization.slug}) = ${keyLower}`)
    .limit(2);
  if (ciMatches.length === 1) return ciMatches[0];
  return null;
}

export async function isUserOrganizationMember(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);
  return !!row;
}

export async function getOrganizationCanonicalOwnerRef(
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.slug ?? null;
}

/**
 * Resolve `orgSlug/legacyTeamSegment` to an organization id.
 * Prefers an existing Better Auth team row (migration-era), otherwise the org slug alone.
 */
export async function resolveOrganizationIdFromLegacyOwnerPath(
  orgSlug: string,
  teamSegment: string,
): Promise<string | null> {
  const resolvedTeam = await resolveTeamByOrgSlugAndTeamSegment(orgSlug, teamSegment);
  if (resolvedTeam) return resolvedTeam.organizationId;
  const org = await resolveOrganizationBySlug(orgSlug);
  return org?.id ?? null;
}
