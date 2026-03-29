import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";
import { resolveOrganizationBySlug } from "@/lib/registry-organization";

export type WritableOrganizationTarget = {
  kind: "organization";
  id: string;
  name: string;
  slug: string;
  role: string;
  targetRef: string;
};

export type PersonalPublishTarget = {
  kind: "user";
  userId: string;
  label: string;
  targetRef: "personal";
};

export type PublishTarget = PersonalPublishTarget | WritableOrganizationTarget;

export type ResolvePublishTargetInput = {
  userId: string;
  publishScope?: "personal" | "organization";
  /** @deprecated use organizationSlug */
  targetRef?: string | null;
  organizationSlug?: string | null;
  organizationId?: string | null;
  activeOrganizationId?: string | null;
};

export type ResolvePublishTargetResult =
  | { ok: true; target: PublishTarget }
  | {
      ok: false;
      code:
        | "NO_ORG_TARGET"
        | "NO_ORG_WRITE_ACCESS"
        | "AMBIGUOUS_ORG_TARGET"
        | "INVALID_ORG_TARGET";
      message: string;
      candidates?: WritableOrganizationTarget[];
    };

export function canWriteOrganizationWithRole(role: string | null | undefined) {
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

export async function getWritableOrganizationTargetForUser(
  userId: string,
  organizationId: string,
): Promise<WritableOrganizationTarget | null> {
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(organization.id, organizationId)))
    .limit(1);

  if (!row || !canWriteOrganizationWithRole(row.role)) return null;

  return {
    kind: "organization",
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role,
    targetRef: `@${row.slug}`,
  };
}

export async function listWritablePublishTargetsForUser(
  userId: string,
): Promise<PublishTarget[]> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name));

  const orgTargets: WritableOrganizationTarget[] = [];
  for (const row of rows) {
    if (!canWriteOrganizationWithRole(row.role)) continue;
    orgTargets.push({
      kind: "organization",
      id: row.id,
      name: row.name,
      slug: row.slug,
      role: row.role,
      targetRef: `@${row.slug}`,
    });
  }

  return [toPersonalPublishTarget(userId), ...orgTargets];
}

async function resolveExplicitOrganizationTargetForUser(params: {
  userId: string;
  targetRef?: string | null;
  organizationSlug?: string | null;
  organizationId?: string | null;
}): Promise<WritableOrganizationTarget | null> {
  if (params.organizationId) {
    return getWritableOrganizationTargetForUser(params.userId, params.organizationId);
  }

  let slug = params.organizationSlug?.trim() ?? "";
  if (params.targetRef && params.targetRef.trim().length > 0) {
    const normalized = params.targetRef.trim().startsWith("@")
      ? params.targetRef.trim().slice(1)
      : params.targetRef.trim();
    const slash = normalized.indexOf("/");
    slug = (slash > 0 ? normalized.slice(0, slash) : normalized).trim();
  }

  if (!slug) return null;
  const org = await resolveOrganizationBySlug(slug);
  if (!org) return null;
  return getWritableOrganizationTargetForUser(params.userId, org.id);
}

export async function resolvePublishTargetForUser(
  params: ResolvePublishTargetInput,
): Promise<ResolvePublishTargetResult> {
  const scope = params.publishScope ?? "personal";
  if (scope === "personal") {
    return { ok: true, target: toPersonalPublishTarget(params.userId) };
  }

  const explicit = await resolveExplicitOrganizationTargetForUser({
    userId: params.userId,
    targetRef: params.targetRef,
    organizationSlug: params.organizationSlug,
    organizationId: params.organizationId,
  });
  const hasExplicitOrgInput =
    !!params.organizationId ||
    !!params.targetRef?.trim() ||
    !!params.organizationSlug?.trim();

  if (hasExplicitOrgInput) {
    if (!explicit) {
      return {
        ok: false,
        code: "NO_ORG_WRITE_ACCESS",
        message:
          "You do not have publish access to the selected organization, or the organization target is invalid.",
      };
    }
    return { ok: true, target: explicit };
  }

  if (params.activeOrganizationId) {
    const activeTarget = await getWritableOrganizationTargetForUser(
      params.userId,
      params.activeOrganizationId,
    );
    if (activeTarget) {
      return { ok: true, target: activeTarget };
    }
  }

  const writableTargets = (await listWritablePublishTargetsForUser(params.userId)).filter(
    (target): target is WritableOrganizationTarget => target.kind === "organization",
  );

  if (writableTargets.length === 0) {
    return {
      ok: false,
      code: "NO_ORG_WRITE_ACCESS",
      message:
        "You do not currently have publish access to any organization. Join an organization first, or publish to personal scope.",
    };
  }

  if (writableTargets.length === 1) {
    return { ok: true, target: writableTargets[0] };
  }

  return {
    ok: false,
    code: "AMBIGUOUS_ORG_TARGET",
    message:
      "You can publish to multiple organizations. Choose one explicitly using targetRef like @org-slug.",
    candidates: writableTargets,
  };
}
