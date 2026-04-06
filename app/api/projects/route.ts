import { NextResponse } from "next/server";
import { getProjectScopeContext } from "@/lib/project-scope";
import { listProjectsForOwner, listProjectsForScope } from "@/lib/project-list";
import { createRegistryProject } from "@/lib/registry-project-create";
import { createServerTimingLogger } from "@/lib/server-timing";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";

export async function POST(request: Request) {
  const { userId, activeOrganizationId } = await getProjectScopeContext(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required. Sign in or provide Authorization: Bearer <token>" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        slug?: string;
        title?: string;
        description?: string | null;
        visibility?: "public" | "private";
        defaultThemeResourceRef?: string | null;
      }
    | null;
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "Missing required field: title" }, { status: 400 });
  }

  const defaultThemeResourceRef =
    typeof body.defaultThemeResourceRef === "string" &&
    body.defaultThemeResourceRef.trim().length > 0
      ? body.defaultThemeResourceRef.trim()
      : null;
  if (
    defaultThemeResourceRef &&
    !parseRegistryDependencyRef(defaultThemeResourceRef)
  ) {
    return NextResponse.json(
      { error: "defaultThemeResourceRef must be a valid registry ref" },
      { status: 400 },
    );
  }

  const result = await createRegistryProject({
    userId,
    title: body.title.trim(),
    description: body.description ?? null,
    slug: body.slug != null ? String(body.slug) : null,
    visibility: body.visibility,
    defaultThemeResourceRef,
    sessionActiveOrganizationId: activeOrganizationId ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ project: result.project });
}

export async function GET(request: Request) {
  const timings = createServerTimingLogger("api-projects-get");
  const url = new URL(request.url);
  const ownerParam = url.searchParams.get("owner");

  let stepStartedAt = performance.now();
  const { userId: requestUserId, activeOrganizationId } = await getProjectScopeContext(request);
  timings.mark("scopeResolution", stepStartedAt);

  if (!ownerParam) {
    if (!requestUserId) {
      return NextResponse.json(
        { error: "Authentication required (owner not specified)" },
        { status: 401 },
      );
    }

    stepStartedAt = performance.now();
    const projects = await listProjectsForScope({
      userId: requestUserId,
      activeOrganizationId,
    });
    timings.mark("projectListQuery", stepStartedAt);
    timings.flush({
      owner: null,
      requestUserId,
      activeOrganizationId,
      projectCount: projects.length,
      outcome: "ok",
    });
    return NextResponse.json({ projects });
  }

  stepStartedAt = performance.now();
  const projects = await listProjectsForOwner({
    owner: ownerParam,
    requestUserId,
  });
  timings.mark("projectListQuery", stepStartedAt);
  timings.flush({
    owner: ownerParam,
    requestUserId,
    activeOrganizationId,
    projectCount: projects.length,
    outcome: "ok",
  });
  return NextResponse.json({ projects });
}
