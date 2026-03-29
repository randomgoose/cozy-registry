import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getProjectScopeContext } from "@/lib/project-scope";
import type { ProjectRole } from "@/lib/project-permissions";
import {
  getProjectIfAccessible,
  getUserProjectRole,
  roleCanManageMembers,
} from "@/lib/project-permissions";
import { member, registryProjectMembers, user } from "@/lib/db/schema";
import { getUserOrganizationRole } from "@/lib/workspace-context";

async function resolveOrgMemberUserId(
  organizationId: string,
  emailOrHandle: string,
): Promise<string | null> {
  const raw = emailOrHandle.trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();

  if (raw.includes("@")) {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(
        and(eq(member.organizationId, organizationId), sql`lower(${user.email}) = ${lowered}`),
      )
      .limit(1);
    return row?.id ?? null;
  }

  const handleKey = raw.startsWith("@") ? lowered.slice(1) : lowered;
  const [byHandle] = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(
      and(
        eq(member.organizationId, organizationId),
        sql`lower(${user.handle}) = ${handleKey}`,
      ),
    )
    .limit(1);
  if (byHandle) return byHandle.id;

  const [byEmail] = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(
      and(eq(member.organizationId, organizationId), sql`lower(${user.email}) = ${lowered}`),
    )
    .limit(1);
  return byEmail?.id ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getProjectScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const project = await getProjectIfAccessible(userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      userId: registryProjectMembers.userId,
      role: registryProjectMembers.role,
      name: user.name,
      email: user.email,
    })
    .from(registryProjectMembers)
    .innerJoin(user, eq(registryProjectMembers.userId, user.id))
    .where(eq(registryProjectMembers.projectId, id));

  return NextResponse.json({ members: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getProjectScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const project = await getProjectIfAccessible(userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const role = await getUserProjectRole(userId, id, project.ownerUserId);
  if (!roleCanManageMembers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!project.organizationId) {
    return NextResponse.json(
      { error: "Adding project members is only supported for organization projects" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { userId?: string; emailOrHandle?: string; role?: ProjectRole }
    | null;
  const newRole = body?.role ?? "viewer";
  if (!["owner", "admin", "editor", "viewer"].includes(newRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (newRole === "owner") {
    return NextResponse.json(
      { error: "Cannot assign owner role via invite; use admin or below." },
      { status: 400 },
    );
  }

  let targetUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!targetUserId && typeof body?.emailOrHandle === "string" && body.emailOrHandle.trim()) {
    targetUserId =
      (await resolveOrgMemberUserId(project.organizationId, body.emailOrHandle)) ?? "";
  }
  if (!targetUserId) {
    return NextResponse.json(
      {
        error:
          "User not found or not in this organization. They must join the organization before you add them to a project.",
      },
      { status: 400 },
    );
  }

  const orgRole = await getUserOrganizationRole(targetUserId, project.organizationId);
  if (!orgRole) {
    return NextResponse.json(
      { error: "User must be a member of the organization first" },
      { status: 400 },
    );
  }

  try {
    await db
      .insert(registryProjectMembers)
      .values({ projectId: id, userId: targetUserId, role: newRole })
      .onConflictDoUpdate({
        target: [registryProjectMembers.projectId, registryProjectMembers.userId],
        set: { role: newRole },
      });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add member";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
