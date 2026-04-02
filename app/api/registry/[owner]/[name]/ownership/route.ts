import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getUserIdFromToken } from "@/lib/auth-api";
import { copyOrMoveRegistryItemToOrganization } from "@/lib/registry";
import { resolvePublishTargetForUser } from "@/lib/publish-target";

type Params = { params: Promise<{ owner: string; name: string }> };

type OwnershipRequestBody = {
  mode?: "copy" | "move";
  targetRef?: string | null;
  organizationSlug?: string | null;
  organizationId?: string | null;
  notes?: string | null;
};

export async function POST(request: Request, { params }: Params) {
  const { owner, name } = await params;

  let userId: string | null = null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) userId = session.user.id;
  if (!userId) userId = await getUserIdFromToken(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as OwnershipRequestBody;
  const mode = body.mode === "copy" ? "copy" : "move";

  const target = await resolvePublishTargetForUser({
    userId,
    publishScope: "organization",
    targetRef: body.targetRef ?? null,
    organizationSlug: body.organizationSlug ?? null,
    organizationId: body.organizationId ?? null,
    activeOrganizationId: session?.session?.activeOrganizationId ?? null,
  });

  if (!target.ok) {
    const status =
      target.code === "NO_ORG_WRITE_ACCESS"
        ? 403
        : target.code === "AMBIGUOUS_ORG_TARGET"
          ? 400
          : 400;
    return NextResponse.json(
      {
        error: target.message,
        code: target.code,
      },
      { status },
    );
  }

  if (target.target.kind !== "organization") {
    return NextResponse.json(
      { error: "Ownership transfer target must be an organization" },
      { status: 400 },
    );
  }

  try {
    const result = await copyOrMoveRegistryItemToOrganization({
      sourceOwnerRef: owner,
      name,
      requestUserId: userId,
      targetOrganizationId: target.target.id,
      mode,
      notes: body.notes ?? null,
    });

    return NextResponse.json({
      success: true,
      mode,
      targetOwnerRef: result.targetOwnerRef,
      version: result.version,
      sourceArchived: result.sourceArchived,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ownership transfer failed";
    if (message.includes("not found") || message.includes("no access")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("Only owner") ||
      message.includes("Only organization editors") ||
      message.includes("write access")
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("already has an item with this name")) {
      return NextResponse.json({ error: message, code: "TARGET_NAME_CONFLICT" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
