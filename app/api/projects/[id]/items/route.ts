import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getProjectScopeContext } from "@/lib/project-scope";
import {
  getProjectIfAccessible,
  getUserProjectRole,
  roleCanEditProject,
} from "@/lib/project-permissions";
import { listProjectItems } from "@/lib/project-items";
import { registryProjectItems, registryItems } from "@/lib/db/schema";

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

  const rows = await listProjectItems(id);
  return NextResponse.json({ items: rows });
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
  const body = (await request.json().catch(() => null)) as { itemId?: string } | null;
  if (!body?.itemId) {
    return NextResponse.json({ error: "Missing required field: itemId" }, { status: 400 });
  }

  const project = await getProjectIfAccessible(userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const role = await getUserProjectRole(userId, id, project.ownerUserId);
  if (!roleCanEditProject(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [item] = await db
    .select({ id: registryItems.id, userId: registryItems.userId, organizationId: registryItems.organizationId })
    .from(registryItems)
    .where(eq(registryItems.id, body.itemId))
    .limit(1);
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  if (project.organizationId) {
    if (item.organizationId !== project.organizationId) {
      return NextResponse.json(
        { error: "Item must belong to the same organization as this project" },
        { status: 400 },
      );
    }
  } else if (item.userId !== userId) {
    return NextResponse.json(
      { error: "Item must belong to you for a personal project" },
      { status: 400 },
    );
  }

  try {
    await db.insert(registryProjectItems).values({
      projectId: id,
      itemId: body.itemId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add item";
    const isUnique = /\bduplicate key\b|\bunique constraint\b|23505/.test(msg);
    if (isUnique) {
      return NextResponse.json({ error: "Item already exists in this project" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
