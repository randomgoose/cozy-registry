import { NextResponse } from "next/server";
import { getProjectScopeContext } from "@/lib/project-scope";
import { getProjectIfAccessible } from "@/lib/project-permissions";
import { listProjectItems } from "@/lib/project-items";

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
  const project = await getProjectIfAccessible(userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      error:
        "Attach-to-project is no longer supported. Publish or move resources as canonical project-scoped items instead.",
    },
    { status: 410 },
  );
}
