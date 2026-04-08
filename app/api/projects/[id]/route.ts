import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getProjectScopeContext } from "@/lib/project-scope";
import {
  getProjectIfAccessible,
  roleCanEditProject,
  getUserProjectRole,
} from "@/lib/project-permissions";
import { registryProjects } from "@/lib/db/schema";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import { normalizeThemeResourceRefsInput } from "@/lib/project-resource-relationships";

function isKebab(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

export async function PATCH(
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
  if (!roleCanEditProject(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        slug?: string;
        title?: string;
        description?: string | null;
        visibility?: "public" | "private";
        defaultThemeResourceRefs?: unknown;
        defaultThemeResourceRef?: string | null;
      }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.slug != null && !isKebab(body.slug)) {
    return NextResponse.json({ error: "slug must be kebab-case" }, { status: 400 });
  }

  const rawDefaultThemeResourceRefs =
    body.defaultThemeResourceRefs !== undefined
      ? normalizeThemeResourceRefsInput(body.defaultThemeResourceRefs)
      : typeof body.defaultThemeResourceRef === "string" ||
          body.defaultThemeResourceRef === null
        ? normalizeThemeResourceRefsInput(body.defaultThemeResourceRef)
        : undefined;
  if (
    rawDefaultThemeResourceRefs &&
    rawDefaultThemeResourceRefs.some((ref) => !parseRegistryDependencyRef(ref))
  ) {
    return NextResponse.json(
      { error: "defaultThemeResourceRef(s) must be valid registry refs" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(registryProjects)
    .set({
      ...(body.slug != null ? { slug: body.slug } : {}),
      ...(body.title != null ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.visibility != null
        ? { visibility: body.visibility === "public" ? "public" : "private" }
        : {}),
      ...(rawDefaultThemeResourceRefs !== undefined
        ? {
            defaultThemeResourceRefs: rawDefaultThemeResourceRefs,
            defaultThemeResourceRef: rawDefaultThemeResourceRefs[0] ?? null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(registryProjects.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project: updated });
}

export async function DELETE(
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
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [deleted] = await db
    .delete(registryProjects)
    .where(eq(registryProjects.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
