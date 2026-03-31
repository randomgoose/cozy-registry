import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";

type SessionLike =
  | {
      user?: { id?: string | null } | null;
      session?: {
        activeOrganizationId?: string | null;
      } | null;
    }
  | null
  | undefined;

export type WorkspaceOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
};

export type WorkspaceContext = {
  organizations: WorkspaceOrganization[];
  activeOrganizationId: string | null;
  activeOrganization: WorkspaceOrganization | null;
};

function emptyWorkspaceContext(): WorkspaceContext {
  return {
    organizations: [],
    activeOrganizationId: null,
    activeOrganization: null,
  };
}

export async function getWorkspaceContextForSession(
  session: SessionLike,
): Promise<WorkspaceContext> {
  const userId = session?.user?.id ?? null;
  if (!userId) return emptyWorkspaceContext();
  const activeOrganizationIdFromSession = session?.session?.activeOrganizationId ?? null;
  return getWorkspaceContextForUser(userId, activeOrganizationIdFromSession);
}

export async function getWorkspaceContextForUser(
  userId: string,
  activeOrganizationId: string | null,
): Promise<WorkspaceContext> {
  const organizationRows = await db
    .select({
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name));

  if (organizationRows.length === 0) return emptyWorkspaceContext();

  const organizations: WorkspaceOrganization[] = organizationRows.map((row) => ({
    id: row.organizationId,
    name: row.organizationName,
    slug: row.organizationSlug,
    role: row.role,
    isActive: row.organizationId === activeOrganizationId,
  }));

  const activeOrganization = organizations.find((item) => item.id === activeOrganizationId) ?? null;

  return {
    organizations,
    activeOrganizationId: activeOrganization?.id ?? null,
    activeOrganization,
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
