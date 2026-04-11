import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registryItems } from "@/lib/db/schema";
import { getProjectScopeContext } from "@/lib/project-scope";
import {
  getProjectIfAccessible,
  getUserProjectRole,
  roleCanEditProject,
} from "@/lib/project-permissions";
import {
  archiveOrganizationRegistryItem,
  archiveRegistryItem,
  moveCanonicalRegistryItemToProject,
} from "@/lib/registry";

async function getActiveProjectItem(projectId: string, itemId: string) {
  const [item] = await db
    .select()
    .from(registryItems)
    .where(
      and(
        eq(registryItems.id, itemId),
        eq(registryItems.canonicalProjectId, projectId),
        eq(registryItems.status, "active"),
      ),
    )
    .limit(1);
  return item ?? null;
}

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

  const item = await getActiveProjectItem(id, itemId);
  if (!item) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  try {
    if (project.organizationId) {
      await archiveOrganizationRegistryItem({
        organizationId: project.organizationId,
        projectKey: project.namespaceKey,
        name: item.name,
        requestUserId: userId,
        lifecycleReason: `Archived from project ${project.namespaceKey}`,
      });
    } else if (project.ownerUserId) {
      await archiveRegistryItem({
        ownerId: project.ownerUserId,
        projectKey: project.namespaceKey,
        name: item.name,
        requestUserId: userId,
        lifecycleReason: `Archived from project ${project.namespaceKey}`,
      });
    } else {
      return NextResponse.json({ error: "Invalid project owner" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete resource";
    if (message.includes("not found") || message.includes("no access")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("Only owner") ||
      message.includes("Only organization editors") ||
      message.includes("Only owner or editor")
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true, action: "archived" });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { userId } = await getProjectScopeContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id, itemId } = await params;
  const sourceProject = await getProjectIfAccessible(userId, id);
  if (!sourceProject) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const sourceRole = await getUserProjectRole(userId, id, sourceProject.ownerUserId);
  if (!roleCanEditProject(sourceRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { targetProjectId?: string } | null;
  const targetProjectId = body?.targetProjectId?.trim() ?? "";
  if (!targetProjectId) {
    return NextResponse.json({ error: "Missing targetProjectId" }, { status: 400 });
  }
  if (targetProjectId === id) {
    return NextResponse.json({ error: "Target project must be different" }, { status: 400 });
  }

  const targetProject = await getProjectIfAccessible(userId, targetProjectId);
  if (!targetProject) {
    return NextResponse.json({ error: "Target project not found" }, { status: 404 });
  }
  const targetRole = await getUserProjectRole(userId, targetProjectId, targetProject.ownerUserId);
  if (!roleCanEditProject(targetRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sameScope =
    sourceProject.organizationId != null
      ? sourceProject.organizationId === targetProject.organizationId
      : sourceProject.ownerUserId != null && sourceProject.ownerUserId === targetProject.ownerUserId;
  if (!sameScope) {
    return NextResponse.json(
      { error: "Can only move resources between projects in the same scope" },
      { status: 400 },
    );
  }

  const item = await getActiveProjectItem(id, itemId);
  if (!item) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  try {
    const moved = await moveCanonicalRegistryItemToProject({
      itemId,
      sourceProjectId: id,
      targetProjectId,
      requestUserId: userId,
    });
    return NextResponse.json({
      success: true,
      item: {
        id: moved.id,
        name: moved.name,
        canonicalProjectId: moved.canonicalProjectId,
        canonicalProjectKey: moved.canonicalProjectKey,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to move resource";
    if (
      message.includes("not found") ||
      message.includes("Target project not found") ||
      message.includes("Source item not found")
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("already contains a resource")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("same scope")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
