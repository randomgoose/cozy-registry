import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  deleteRegistryItem,
  getRegistryItemByOwnerAndName,
  updateRegistryItemVisibility,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";
import { resolveOwner } from "@/lib/owner";

type Params = { params: Promise<{ owner: string; name: string }> };

/**
 * 删除组件（仅 owner）。用于 Web UI 与 AI 删除操作。
 */
export async function DELETE(request: Request, { params }: Params) {
  const { owner, name } = await params;

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
    const resolved = await resolveOwner(owner);
    if (!resolved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await deleteRegistryItem({
      ownerId: resolved.userId,
      name,
      requestUserId: userId,
      ownerRef: owner,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    if (msg.includes("not found") || msg.includes("no access")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Only owner")) {
      return NextResponse.json({ error: msg }, { status: 403 });
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
export async function GET(_request: Request, { params }: Params) {
  const { owner, name } = await params;
  // Optional auth: allow owner to read their private items
  const session = await auth.api.getSession({ headers: await headers() });
  const requestUserId = session?.user?.id ?? null;
  const resolved = await resolveOwner(owner);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const item = await getRegistryItemByOwnerAndName(
    resolved.userId,
    name,
    requestUserId,
  );
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    name: item.name,
    title: item.title,
    description: item.description,
    type: item.type,
    visibility: item.visibility,
  });
}

/**
 * 更新组件可见性（public/private），仅 owner。
 */
export async function PATCH(request: Request, { params }: Params) {
  const { owner, name } = await params;

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
    const resolved = await resolveOwner(owner);
    if (!resolved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await updateRegistryItemVisibility({
      ownerId: resolved.userId,
      name,
      requestUserId: userId,
      visibility,
    });

    return NextResponse.json({
      success: true,
      visibility: updated.visibility,
      updatedAt: updated.updatedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    if (msg.includes("not found") || msg.includes("no access")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Only owner")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
