import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import {
  cancelProjectInvitation,
  inviteProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
} from "@cozy/platform-services/project-access-service";
import { getProjectMembership } from "@cozy/platform-services/project-membership-service";

export async function handlePlatformProjectMembersRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [id, suffix] = url.pathname
    .replace(/^\/projects\//, "")
    .split("/")
    .filter(Boolean);

  if (!id || suffix !== "members") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "GET") {
    const result = await getProjectMembership({ context, projectId: id });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof inviteProjectMember
    >[0]["body"];
    const result = await inviteProjectMember({
      request,
      context,
      projectId: id,
      body,
    });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformProjectMemberDetailRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [projectId, suffix, memberId] = url.pathname
    .replace(/^\/projects\//, "")
    .split("/")
    .filter(Boolean);

  if (!projectId || suffix !== "members" || !memberId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof updateProjectMemberRole
    >[0]["body"];
    const result = await updateProjectMemberRole({
      request,
      context,
      projectId,
      memberId,
      body,
    });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "DELETE") {
    const result = await removeProjectMember({
      request,
      context,
      projectId,
      userId: memberId,
    });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformProjectInvitationDetailRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [projectId, suffix, invitationId] = url.pathname
    .replace(/^\/projects\//, "")
    .split("/")
    .filter(Boolean);

  if (!projectId || suffix !== "invitations" || !invitationId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "DELETE") {
    const result = await cancelProjectInvitation({
      request,
      context,
      projectId,
      invitationId,
    });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
