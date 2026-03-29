import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import { getCurrentTeamCollaboration } from "@cozy/platform-services/team-collaboration-service";

export async function handlePlatformTeamCurrentCollaborationRoute(
  request: Request,
): Promise<Response> {
  const context = await getPlatformRequestContext(request);
  const result = await getCurrentTeamCollaboration({ context });
  return Response.json(result.body, { status: result.status });
}
