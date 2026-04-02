import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, organization, user } from "@/lib/db/schema";

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
  logo: string | null;
  role: string;
  isActive: boolean;
};

export type WorkspaceContext = {
  user: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  organizations: WorkspaceOrganization[];
  activeOrganizationId: string | null;
  activeOrganization: WorkspaceOrganization | null;
};

function emptyWorkspaceContext(): WorkspaceContext {
  return {
    user: null,
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
  const [[userRow], organizationRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    db
      .select({
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        organizationLogo: organization.logo,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .orderBy(asc(organization.name)),
  ]);

  const organizations: WorkspaceOrganization[] = organizationRows.map((row) => ({
    id: row.organizationId,
    name: row.organizationName,
    slug: row.organizationSlug,
    logo: row.organizationLogo,
    role: row.role,
    isActive: row.organizationId === activeOrganizationId,
  }));

  const activeOrganization = organizations.find((item) => item.id === activeOrganizationId) ?? null;

  return {
    user: userRow
      ? {
          id: userRow.id,
          name: userRow.name,
          image: userRow.image,
        }
      : null,
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
