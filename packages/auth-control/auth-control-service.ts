import { auth } from "@cozy/auth-runtime/auth";
import { db } from "@cozy/db";
import { user } from "@cozy/db/schema";
import {
  ensureTeamSlug,
  isUserTeamMember,
  resolveTeamByOrgSlugAndTeamSegment,
} from "@cozy/auth-control/registry-team";
import { getWorkspaceContextForSession } from "@cozy/auth-control/workspace-context";
import { and, eq, isNull } from "drizzle-orm";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;

function buildAuthControlUrl(request: Request, path: string) {
  const sourceUrl = new URL(request.url);
  const origin = process.env.BETTER_AUTH_URL?.trim() || sourceUrl.origin;
  return new URL(
    path.startsWith("/api/auth") ? path : `/api/auth${path.startsWith("/") ? path : `/${path}`}`,
    origin,
  );
}

export async function forwardAuthControlRequest(
  request: Request,
  path: string,
): Promise<Response> {
  const targetUrl = buildAuthControlUrl(request, path);
  const headers = new Headers(request.headers);
  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
    init.body = await request.arrayBuffer();
  }

  return auth.handler(new Request(targetUrl, init));
}

export async function getWorkspaceScopeContext(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await getWorkspaceContextForSession(session);

  return Response.json({
    userId: session.user.id,
    workspace,
  });
}

export async function getAuthControlSession(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ user: null, session: null }, { status: 200 });
  }

  return Response.json({
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
    session: {
      activeOrganizationId: session.session?.activeOrganizationId ?? null,
      activeTeamId: session.session?.activeTeamId ?? null,
    },
  });
}

export async function getAuthControlProfile(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ user: null }, { status: 401 });
  }

  const [row] = await db
    .select({ id: user.id, email: user.email, name: user.name, handle: user.handle })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return Response.json({ user: row ?? null });
}

export async function postAuthControlHandle(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const handle =
    body && typeof body === "object" && "handle" in body
      ? String((body as Record<string, unknown>).handle ?? "").trim().toLowerCase()
      : "";

  if (!HANDLE_RE.test(handle)) {
    return Response.json(
      {
        error:
          "Invalid username format. Use lowercase letters, numbers, '.', '-', or '_', with length 2-30.",
      },
      { status: 400 },
    );
  }

  const updated = await db
    .update(user)
    .set({ handle })
    .where(and(eq(user.id, userId), isNull(user.handle)))
    .returning({ handle: user.handle });

  if (updated.length > 0) {
    return Response.json({ success: true, handle });
  }

  const [self] = await db
    .select({ handle: user.handle })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (self?.handle) {
    return Response.json(
      { error: "Username is already set and can’t be changed yet." },
      { status: 409 },
    );
  }

  return Response.json(
    { error: "That username is already taken." },
    { status: 409 },
  );
}

export async function getTeamRouteResolution(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const orgSlug = url.searchParams.get("orgSlug")?.trim() ?? "";
  const teamSlug = url.searchParams.get("teamSlug")?.trim() ?? "";

  if (!orgSlug || !teamSlug) {
    return Response.json(
      { error: "orgSlug and teamSlug are required" },
      { status: 400 },
    );
  }

  const targetTeam = await resolveTeamByOrgSlugAndTeamSegment(orgSlug, teamSlug);
  if (!targetTeam) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  if (!(await isUserTeamMember(userId, targetTeam.teamId))) {
    return Response.json(
      { error: "You do not have access to this team." },
      { status: 403 },
    );
  }

  const isWorkspaceSynced =
    session?.session?.activeOrganizationId === targetTeam.organizationId &&
    session?.session?.activeTeamId === targetTeam.teamId;

  return Response.json({
    organizationId: targetTeam.organizationId,
    organizationName: targetTeam.organizationName,
    orgSlug: targetTeam.orgSlug,
    teamId: targetTeam.teamId,
    teamName: targetTeam.teamName,
    teamSlug: targetTeam.teamSlug,
    isWorkspaceSynced,
  });
}

export async function postEnsureTeamSlug(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as { teamId?: unknown }));
  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
  if (!teamId) {
    return Response.json({ error: "teamId is required" }, { status: 400 });
  }

  if (!(await isUserTeamMember(userId, teamId))) {
    return Response.json(
      { error: "You do not have access to this team." },
      { status: 403 },
    );
  }

  const slug = await ensureTeamSlug(teamId);
  if (!slug) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  return Response.json({ success: true, slug });
}
