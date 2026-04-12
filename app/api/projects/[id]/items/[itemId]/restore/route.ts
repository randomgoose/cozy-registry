import { NextResponse } from "next/server";
import { getProjectScopeContext } from "@/lib/project-scope";
import {
  getProjectIfAccessibleByLifecycle,
  getUserProjectRole,
  roleCanEditProject,
} from "@/lib/project-permissions";
import { restoreRegistryItemInProject } from "@/lib/registry";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { userId } = await getProjectScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: projectId, itemId } = await params;

  const project = await getProjectIfAccessibleByLifecycle(userId, projectId, {
    includeArchived: true,
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getUserProjectRole(userId, projectId, project.ownerUserId);
  if (!roleCanEditProject(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await restoreRegistryItemInProject({
      projectId,
      itemId,
      requestUserId: userId,
    });
    return NextResponse.json({ success: true, action: "restored" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restore resource";
    if (message.includes("not found") || message.includes("Resource not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("Only owner") ||
      message.includes("Only owner or editor") ||
      message.includes("not archived")
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
