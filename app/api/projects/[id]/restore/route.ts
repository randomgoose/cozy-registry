import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { registryProjects } from "@/lib/db/schema";
import { getProjectScopeContext } from "@/lib/project-scope";
import {
  getProjectIfAccessibleByLifecycle,
  getUserProjectRole,
} from "@/lib/project-permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getProjectScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectIfAccessibleByLifecycle(userId, id, { includeArchived: true });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getUserProjectRole(userId, id, project.ownerUserId);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (project.status !== "archived") {
    return NextResponse.json({ error: "Project is not in trash" }, { status: 409 });
  }

  const [restored] = await db
    .update(registryProjects)
    .set({
      status: "active",
      archivedAt: null,
      archivedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(registryProjects.id, id))
    .returning();

  if (!restored) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, action: "restored" });
}
