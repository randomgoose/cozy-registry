import { NextResponse } from "next/server";
import { getProjectScopeContext } from "@/lib/project-scope";
import {
  getProjectIfAccessible,
} from "@/lib/project-permissions";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
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

  return NextResponse.json(
    {
      error:
        "Attach-to-project removal is no longer supported. Move or archive the canonical project-scoped item instead.",
    },
    { status: 410 },
  );
}
