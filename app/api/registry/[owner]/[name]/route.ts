import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  archiveOrganizationRegistryItem,
  archiveRegistryItem,
  getRegistryItemByScopedIdentityAndVersion,
  permanentlyDeleteOrganizationRegistryItem,
  permanentlyDeleteRegistryItem,
  updateOrganizationRegistryItemVisibility,
  updateRegistryItemVisibility,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";
import { resolveOwner } from "@/lib/owner";
import { parseTeamOwnerPath } from "@/lib/registry-team";
import {
  resolveOrganizationBySlug,
  resolveOrganizationIdFromLegacyOwnerPath,
} from "@/lib/registry-organization";

type Params = { params: Promise<{ owner: string; name: string }> };

/**
 * 删除组件（仅 owner）。用于 Web UI 与 AI 删除操作。
 */
export async function DELETE(request: Request, { params }: Params) {
  const { owner, name } = await params;
  const { searchParams } = new URL(request.url);
  const projectParam = searchParams.get("project");
  const project =
    typeof projectParam === "string" && projectParam.trim().length > 0
      ? projectParam.trim()
      : null;
  if (!project) {
    return NextResponse.json(
      { error: "Missing required query param: project" },
      { status: 400 },
    );
  }
  const permanentDelete =
    searchParams.get("mode") === "permanent" || searchParams.get("permanent") === "true";
  const lifecycleReason = searchParams.get("reason");

  let userId: string | null = null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) userId = session.user.id;
  if (!userId) userId = await getUserIdFromToken(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const teamPath = parseTeamOwnerPath(owner);
    if (teamPath) {
      const organizationId = await resolveOrganizationIdFromLegacyOwnerPath(
        teamPath.orgSlug,
        teamPath.teamSegment,
      );
      if (!organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (permanentDelete) {
        await permanentlyDeleteOrganizationRegistryItem({
          organizationId,
          ownerRef: owner,
          projectKey: project,
          name,
          requestUserId: userId,
          lifecycleReason,
        });
      } else {
        await archiveOrganizationRegistryItem({
          organizationId,
          ownerRef: owner,
          projectKey: project,
          name,
          requestUserId: userId,
          lifecycleReason,
        });
      }
      return NextResponse.json({ success: true, action: permanentDelete ? "deleted" : "archived" });
    }

    const resolvedUser = await resolveOwner(owner);
    if (resolvedUser) {
      if (permanentDelete) {
        await permanentlyDeleteRegistryItem({
          ownerId: resolvedUser.userId,
          ownerRef: owner,
          projectKey: project,
          name,
          requestUserId: userId,
          lifecycleReason,
        });
      } else {
        await archiveRegistryItem({
          ownerId: resolvedUser.userId,
          ownerRef: owner,
          projectKey: project,
          name,
          requestUserId: userId,
          lifecycleReason,
        });
      }
      return NextResponse.json({ success: true, action: permanentDelete ? "deleted" : "archived" });
    }

    const org = await resolveOrganizationBySlug(owner);
    if (org) {
      if (permanentDelete) {
        await permanentlyDeleteOrganizationRegistryItem({
          organizationId: org.id,
          ownerRef: owner,
          projectKey: project,
          name,
          requestUserId: userId,
          lifecycleReason,
        });
      } else {
        await archiveOrganizationRegistryItem({
          organizationId: org.id,
          ownerRef: owner,
          projectKey: project,
          name,
          requestUserId: userId,
          lifecycleReason,
        });
      }
      return NextResponse.json({ success: true, action: permanentDelete ? "deleted" : "archived" });
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    if (msg.includes("not found") || msg.includes("no access")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Only owner") || msg.includes("Only organization editors")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg.includes("archived first")) {
      return NextResponse.json({ error: msg, code: "ARCHIVE_REQUIRED" }, { status: 409 });
    }
    if (msg.includes("Cannot delete: still referenced")) {
      return NextResponse.json(
        { error: msg, code: "REGDEP_REFERENCED" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * 获取单个组件元信息（只读），方便未来扩展（目前 UI 用页面路由）。
 */
export async function GET(request: Request, { params }: Params) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const projectParam = url.searchParams.get("project");
  const project =
    typeof projectParam === "string" && projectParam.trim().length > 0
      ? projectParam.trim()
      : null;
  if (!project) {
    return NextResponse.json(
      { error: "Missing required query param: project" },
      { status: 400 },
    );
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const requestUserId = session?.user?.id ?? null;

  const item = await getRegistryItemByScopedIdentityAndVersion({
    ownerId: owner,
    projectKey: project,
    name,
    version: null,
    requestUserId,
  });
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    name: item.name,
    title: item.title,
    description: item.description,
    type: item.type,
    visibility: item.visibility,
    status: item.status,
    archivedAt: item.archivedAt,
  });
}

/**
 * 更新组件可见性（public/private），仅 owner。
 */
export async function PATCH(request: Request, { params }: Params) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const projectParam = url.searchParams.get("project");
  const project =
    typeof projectParam === "string" && projectParam.trim().length > 0
      ? projectParam.trim()
      : null;

  let userId: string | null = null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) userId = session.user.id;
  if (!userId) userId = await getUserIdFromToken(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({} as unknown));
  const visibility =
    body && typeof body === "object" && (body as { visibility?: unknown }).visibility === "private"
      ? "private"
      : "public";

  try {
    const teamPath = parseTeamOwnerPath(owner);
    if (teamPath) {
      const organizationId = await resolveOrganizationIdFromLegacyOwnerPath(
        teamPath.orgSlug,
        teamPath.teamSegment,
      );
      if (!organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const updated = await updateOrganizationRegistryItemVisibility({
        organizationId,
        ownerRef: owner,
        projectKey: project,
        name,
        requestUserId: userId,
        visibility,
      });

      return NextResponse.json({
        success: true,
        visibility: updated?.visibility,
        updatedAt: updated?.updatedAt,
      });
    }

    const resolvedUser = await resolveOwner(owner);
    if (resolvedUser) {
      const updated = await updateRegistryItemVisibility({
        ownerId: resolvedUser.userId,
        ownerRef: owner,
        projectKey: project,
        name,
        requestUserId: userId,
        visibility,
      });

      return NextResponse.json({
        success: true,
        visibility: updated.visibility,
        updatedAt: updated.updatedAt,
      });
    }

    const org = await resolveOrganizationBySlug(owner);
    if (org) {
      const updated = await updateOrganizationRegistryItemVisibility({
        organizationId: org.id,
        ownerRef: owner,
        projectKey: project,
        name,
        requestUserId: userId,
        visibility,
      });

      return NextResponse.json({
        success: true,
        visibility: updated?.visibility,
        updatedAt: updated?.updatedAt,
      });
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    if (msg.includes("not found") || msg.includes("no access")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Only owner")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg.includes("cannot be modified")) {
      return NextResponse.json({ error: msg, code: "ITEM_ARCHIVED" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
