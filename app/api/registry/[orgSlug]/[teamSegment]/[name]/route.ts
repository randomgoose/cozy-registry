import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  deleteTeamRegistryItem,
  getRegistryItemByOwnerNameAndVersion,
  updateTeamRegistryItemVisibility,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";
import { resolveTeamByOrgSlugAndTeamSegment } from "@/lib/registry-team";

type Params = { params: Promise<{ orgSlug: string; teamSegment: string; name: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { orgSlug, teamSegment, name } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const requestUserId = session?.user?.id ?? null;
  const resolvedTeam = await resolveTeamByOrgSlugAndTeamSegment(orgSlug, teamSegment);
  if (!resolvedTeam) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const item = await getRegistryItemByOwnerNameAndVersion(
    `${orgSlug}/${teamSegment}`,
    name,
    null,
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

export async function PATCH(request: Request, { params }: Params) {
  const { orgSlug, teamSegment, name } = await params;

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

  const resolvedTeam = await resolveTeamByOrgSlugAndTeamSegment(orgSlug, teamSegment);
  if (!resolvedTeam) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({} as unknown));
  const visibility =
    body && typeof body === "object" && (body as { visibility?: unknown }).visibility === "private"
      ? "private"
      : "public";

  try {
    const updated = await updateTeamRegistryItemVisibility({
      teamId: resolvedTeam.teamId,
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
    if (msg.includes("Only owner or editor")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { orgSlug, teamSegment, name } = await params;

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

  const resolvedTeam = await resolveTeamByOrgSlugAndTeamSegment(orgSlug, teamSegment);
  if (!resolvedTeam) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await deleteTeamRegistryItem({
      teamId: resolvedTeam.teamId,
      name,
      requestUserId: userId,
      ownerRef: `${orgSlug}/${teamSegment}`,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    if (msg.includes("not found") || msg.includes("no access")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Only owner or editor")) {
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
