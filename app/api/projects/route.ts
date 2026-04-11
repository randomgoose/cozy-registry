import { NextResponse } from "next/server";
import { getProjectScopeContext } from "@/lib/project-scope";
import { listProjectsForOwner, listProjectsForScope } from "@/lib/project-list";
import { createRegistryProject } from "@/lib/registry-project-create";
import { createServerTimingLogger } from "@/lib/server-timing";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import { normalizeThemeResourceRefsInput } from "@/lib/project-resource-relationships";
import { materializeProjectInitialization } from "@/lib/project-initialization";
import type { ProjectCreateMode } from "@/lib/starter-kits";

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
        createMode?: ProjectCreateMode;
        defaultThemeResourceRefs?: unknown;
        defaultThemeResourceRef?: string | null;
      }
    | null;
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "Missing required field: title" }, { status: 400 });
  }

  const defaultThemeResourceRefs = normalizeThemeResourceRefsInput(
    body.defaultThemeResourceRefs,
  );
  const normalizedDefaultThemeResourceRefs =
    defaultThemeResourceRefs.length > 0
      ? defaultThemeResourceRefs
      : normalizeThemeResourceRefsInput(body.defaultThemeResourceRef);
  if (
    normalizedDefaultThemeResourceRefs.some(
      (ref) => !parseRegistryDependencyRef(ref),
    )
  ) {
    return NextResponse.json(
      { error: "defaultThemeResourceRef(s) must be valid registry refs" },
      { status: 400 },
    );
  }

  const result = await createRegistryProject({
    userId,
    title: body.title.trim(),
    description: body.description ?? null,
    slug: body.slug != null ? String(body.slug) : null,
    visibility: body.visibility,
    defaultThemeResourceRefs: normalizedDefaultThemeResourceRefs,
    defaultThemeResourceRef: normalizedDefaultThemeResourceRefs[0] ?? null,
    sessionActiveOrganizationId: activeOrganizationId ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const createMode: ProjectCreateMode = body.createMode === "primitives-kit" ? "primitives-kit" : "empty";
  const initialization = await materializeProjectInitialization({
    createMode,
    project: result.project,
    requestUserId: userId,
  }).catch((error) => ({
    starterKit: createMode === "empty" ? null : createMode,
    createdItems: [],
    defaultThemeResourceRefs: result.project.defaultThemeResourceRefs ?? [],
    error: error instanceof Error ? error.message : "Failed to materialize starter kit",
  }));

  return NextResponse.json({
    project: {
      ...result.project,
      defaultThemeResourceRefs:
        initialization.defaultThemeResourceRefs.length > 0
          ? initialization.defaultThemeResourceRefs
          : result.project.defaultThemeResourceRefs,
      defaultThemeResourceRef:
        initialization.defaultThemeResourceRefs[0] ??
        result.project.defaultThemeResourceRef,
    },
    initialization,
  });
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
