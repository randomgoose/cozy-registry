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

type ExplicitOrgResolve =
  | { kind: "ok"; target: WritableOrganizationTarget }
  | { kind: "org_not_found"; hint: string }
  | { kind: "not_member"; orgSlug: string; orgName: string }
  | { kind: "no_write"; orgSlug: string; orgName: string; role: string }
  | { kind: "empty_target" };

async function membershipRoleForOrg(userId: string, organizationId: string) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);
  return row?.role ?? null;
}

async function resolveExplicitOrganizationTargetForUser(params: {
  userId: string;
  targetRef?: string | null;
  organizationSlug?: string | null;
  organizationId?: string | null;
}): Promise<ExplicitOrgResolve> {
  if (params.organizationId?.trim()) {
    const id = params.organizationId.trim();
    const target = await getWritableOrganizationTargetForUser(params.userId, id);
    if (target) return { kind: "ok", target };
    const [byId] = await db
      .select({
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
      })
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1);
    if (!byId) {
      return { kind: "org_not_found", hint: id };
    }
    const role = await membershipRoleForOrg(params.userId, id);
    if (!role) {
      return { kind: "not_member", orgSlug: byId.slug, orgName: byId.name };
    }
    return {
      kind: "no_write",
      orgSlug: byId.slug,
      orgName: byId.name,
      role,
    };
  }

  let slug = params.organizationSlug?.trim() ?? "";
  if (params.targetRef && params.targetRef.trim().length > 0) {
    const normalized = params.targetRef.trim().startsWith("@")
      ? params.targetRef.trim().slice(1)
      : params.targetRef.trim();
    const slash = normalized.indexOf("/");
    slug = (slash > 0 ? normalized.slice(0, slash) : normalized).trim();
  }

  if (!slug) {
    return { kind: "empty_target" };
  }

  const org = await resolveOrganizationBySlug(slug);
  if (!org) {
    return { kind: "org_not_found", hint: slug };
  }

  const target = await getWritableOrganizationTargetForUser(params.userId, org.id);
  if (target) {
    return { kind: "ok", target };
  }

  const role = await membershipRoleForOrg(params.userId, org.id);
  if (!role) {
    return { kind: "not_member", orgSlug: org.slug, orgName: org.name };
  }
  return { kind: "no_write", orgSlug: org.slug, orgName: org.name, role };
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
    !!params.organizationId?.trim() ||
    !!params.targetRef?.trim() ||
    !!params.organizationSlug?.trim();

  if (hasExplicitOrgInput) {
    if (explicit.kind === "ok") {
      return { ok: true, target: explicit.target };
    }
    if (explicit.kind === "empty_target") {
      return {
        ok: false,
        code: "NO_ORG_TARGET",
        message:
          "Organization scope was requested but organizationSlug / targetRef is missing or empty. Pass organizationSlug (workspace slug) or targetRef (e.g. @acme). Call list_publish_targets first to see valid slugs.",
      };
    }
    if (explicit.kind === "org_not_found") {
      return {
        ok: false,
        code: "INVALID_ORG_TARGET",
        message: `No organization matches "${explicit.hint}". Use list_publish_targets and pass the exact slug as organizationSlug or targetRef (e.g. @acme → slug "acme"). Do not use the display name.`,
      };
    }
    if (explicit.kind === "not_member") {
      return {
        ok: false,
        code: "NO_ORG_WRITE_ACCESS",
        message: `You are not a member of organization "${explicit.orgSlug}" (${explicit.orgName}). Sign in with the account that belongs to this workspace, or check the slug.`,
      };
    }
    return {
      ok: false,
      code: "NO_ORG_WRITE_ACCESS",
      message: `Organization "${explicit.orgSlug}" requires owner or editor role to publish or create projects. Your current role is "${explicit.role}".`,
    };
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
