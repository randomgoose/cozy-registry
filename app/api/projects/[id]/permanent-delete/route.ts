import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registryProjects } from "@/lib/db/schema";
import { getProjectScopeContext } from "@/lib/project-scope";
import {
  getProjectIfAccessibleByLifecycle,
  getUserProjectRole,
} from "@/lib/project-permissions";

/**
 * Permanently remove an archived project row. Linked registry items keep their data
 * with canonical_project_id cleared (FK on delete set null).
 */
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

  const deletedRows = await db.delete(registryProjects).where(eq(registryProjects.id, id)).returning({
    id: registryProjects.id,
  });

  if (deletedRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, action: "permanently_deleted" });
}
