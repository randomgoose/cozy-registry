import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { getProjectIfAccessible } from "@/lib/project-permissions";
import {
  decodeActivityCursor,
  listRegistryActivities,
  REGISTRY_ACTIVITY_EVENT_TYPES,
} from "@/lib/registry-activities";
import { isUserOrganizationMember, resolveOrganizationBySlug } from "@/lib/registry-organization";

export const dynamic = "force-dynamic";

function parseLimit(raw: string | null): number {
  if (!raw) return 30;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return 30;
  return Math.min(Math.max(n, 1), 100);
}

function parseEventTypes(raw: string | null): string[] | null {
  if (!raw?.trim()) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set(REGISTRY_ACTIVITY_EVENT_TYPES);
  const filtered = parts.filter((t) => allowed.has(t as (typeof REGISTRY_ACTIVITY_EVENT_TYPES)[number]));
  return filtered.length > 0 ? filtered : null;
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);
  const userId = tokenCtx?.userId ?? session?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const organizationSlug = url.searchParams.get("organizationSlug")?.trim() ?? "";
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeActivityCursor(url.searchParams.get("cursor"));
  const eventTypes = parseEventTypes(url.searchParams.get("eventTypes"));

  if (scope !== "personal" && scope !== "organization" && scope !== "project") {
    return NextResponse.json(
      { error: "Invalid or missing scope (personal | organization | project)" },
      { status: 400 },
    );
  }

  if (scope === "organization") {
    if (!organizationSlug) {
      return NextResponse.json(
        { error: "organizationSlug is required for organization scope" },
        { status: 400 },
      );
    }
    const org = await resolveOrganizationBySlug(organizationSlug);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (!(await isUserOrganizationMember(userId, org.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { items, nextCursor, hasMore } = await listRegistryActivities({
      scope: { kind: "organization", organizationId: org.id },
      limit,
      cursor,
      eventTypes,
    });

    return NextResponse.json({
      scope: { type: "organization", organizationId: org.id, label: org.name },
      items,
      nextCursor,
      hasMore,
    });
  }

  if (scope === "project") {
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required for project scope" },
        { status: 400 },
      );
    }
    const project = await getProjectIfAccessible(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { items, nextCursor, hasMore } = await listRegistryActivities({
      scope: { kind: "project", projectId },
      limit,
      cursor,
      eventTypes,
    });

    return NextResponse.json({
      scope: { type: "project", projectId, label: project.title },
      items,
      nextCursor,
      hasMore,
    });
  }

  const { items, nextCursor, hasMore } = await listRegistryActivities({
    scope: { kind: "personal", userId },
    limit,
    cursor,
    eventTypes,
  });

  return NextResponse.json({
    scope: { type: "personal", userId, label: "Personal" },
    items,
    nextCursor,
    hasMore,
  });
}
