import { and, eq } from "drizzle-orm";
import { db } from "@cozy/db";
import { projects, team, teamMember } from "@cozy/db/schema";
import { forwardAuthControlRequest } from "@cozy/auth-control/auth-control-service";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

type ProjectAccessContext = Pick<PlatformRequestContext, "userId">;
type ProjectAccessResult = {
  status: number;
  body: Record<string, unknown>;
};
type ResolvedWritableTeamProject =
  | {
      error: ProjectAccessResult;
    }
  | {
      project: {
        id: string;
        title: string;
        ownerTeamId: string | null;
      };
      team: {
        id: string;
        organizationId: string;
      };
    };

async function resolveWritableTeamProject(input: {
  context: ProjectAccessContext;
  projectId: string;
}): Promise<ResolvedWritableTeamProject> {
  if (!input.context.userId) {
    return { error: { status: 401, body: { error: "Authentication required" } } };
  }

  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      ownerTeamId: projects.ownerTeamId,
    })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);

  if (!project) {
    return { error: { status: 404, body: { error: "Project not found" } } };
  }

  if (!project.ownerTeamId) {
    return {
      error: {
        status: 400,
        body: { error: "Personal projects do not support shared member mutations yet." },
      },
    };
  }

  const [[membership], [teamRow]] = await Promise.all([
    db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, project.ownerTeamId),
          eq(teamMember.userId, input.context.userId),
        ),
      )
      .limit(1),
    db
      .select({
        id: team.id,
        organizationId: team.organizationId,
      })
      .from(team)
      .where(eq(team.id, project.ownerTeamId))
      .limit(1),
  ]);

  if (!membership || !teamRow) {
    return { error: { status: 404, body: { error: "Project not found" } } };
  }

  return {
    project,
    team: teamRow,
  };
}

async function forwardProjectMutation(input: {
  request: Request;
  path: string;
  body: Record<string, unknown>;
}) {
  const headers = new Headers(input.request.headers);
  headers.set("Content-Type", "application/json");

  const forwardedRequest = new Request(input.request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(input.body),
  });

  return forwardAuthControlRequest(forwardedRequest, input.path);
}

export async function inviteProjectMember(input: {
  request: Request;
  context: ProjectAccessContext;
  projectId: string;
  body: { email?: string; role?: string } | null;
}): Promise<ProjectAccessResult> {
  const resolved = await resolveWritableTeamProject(input);
  if ("error" in resolved) {
    return resolved.error;
  }

  const email = typeof input.body?.email === "string" ? input.body.email.trim() : "";
  const role = typeof input.body?.role === "string" ? input.body.role : "member";

  if (!email) {
    return { status: 400, body: { error: "email is required" } };
  }

  const response = await forwardProjectMutation({
    request: input.request,
    path: "/organization/invite-member",
    body: {
      email,
      role,
      organizationId: resolved.team.organizationId,
      teamId: resolved.team.id,
    },
  });

  return {
    status: response.status,
    body: (await response.json().catch(() => ({ error: "Failed to invite member" }))) as Record<
      string,
      unknown
    >,
  };
}

export async function updateProjectMemberRole(input: {
  request: Request;
  context: ProjectAccessContext;
  projectId: string;
  memberId: string;
  body: { role?: string } | null;
}): Promise<ProjectAccessResult> {
  const resolved = await resolveWritableTeamProject(input);
  if ("error" in resolved) {
    return resolved.error;
  }

  const role = typeof input.body?.role === "string" ? input.body.role : "";
  if (!role) {
    return { status: 400, body: { error: "role is required" } };
  }

  const response = await forwardProjectMutation({
    request: input.request,
    path: "/organization/update-member-role",
    body: {
      memberId: input.memberId,
      role,
      organizationId: resolved.team.organizationId,
    },
  });

  return {
    status: response.status,
    body: (await response.json().catch(() => ({ error: "Failed to update role" }))) as Record<
      string,
      unknown
    >,
  };
}

export async function removeProjectMember(input: {
  request: Request;
  context: ProjectAccessContext;
  projectId: string;
  userId: string;
}): Promise<ProjectAccessResult> {
  const resolved = await resolveWritableTeamProject(input);
  if ("error" in resolved) {
    return resolved.error;
  }

  const response = await forwardProjectMutation({
    request: input.request,
    path: "/organization/remove-team-member",
    body: {
      teamId: resolved.team.id,
      userId: input.userId,
    },
  });

  return {
    status: response.status,
    body: (await response.json().catch(() => ({ error: "Failed to remove member" }))) as Record<
      string,
      unknown
    >,
  };
}

export async function cancelProjectInvitation(input: {
  request: Request;
  context: ProjectAccessContext;
  projectId: string;
  invitationId: string;
}): Promise<ProjectAccessResult> {
  const resolved = await resolveWritableTeamProject(input);
  if ("error" in resolved) {
    return resolved.error;
  }

  const response = await forwardProjectMutation({
    request: input.request,
    path: "/organization/cancel-invitation",
    body: {
      invitationId: input.invitationId,
    },
  });

  return {
    status: response.status,
    body: (await response.json().catch(() => ({ error: "Failed to cancel invitation" }))) as Record<
      string,
      unknown
    >,
  };
}
