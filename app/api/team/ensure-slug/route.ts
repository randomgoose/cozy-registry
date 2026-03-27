import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { ensureTeamSlug, isUserTeamMember } from "@/lib/registry-team";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as { teamId?: unknown }));
  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  if (!(await isUserTeamMember(userId, teamId))) {
    return NextResponse.json({ error: "You do not have access to this team." }, { status: 403 });
  }

  const slug = await ensureTeamSlug(teamId);
  if (!slug) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, slug });
}
