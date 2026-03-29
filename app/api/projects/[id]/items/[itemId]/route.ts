import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getProjectScopeContext } from "@/lib/project-scope";
import {
  getProjectIfAccessible,
  getUserProjectRole,
  roleCanEditProject,
} from "@/lib/project-permissions";
import { registryProjectItems } from "@/lib/db/schema";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { userId } = await getProjectScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id, itemId } = await params;

  const project = await getProjectIfAccessible(userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const role = await getUserProjectRole(userId, id, project.ownerUserId);
  if (!roleCanEditProject(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(registryProjectItems)
    .where(and(eq(registryProjectItems.projectId, id), eq(registryProjectItems.itemId, itemId)));

  return NextResponse.json({ success: true });
}
