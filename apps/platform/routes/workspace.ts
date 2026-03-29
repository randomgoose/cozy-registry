import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import { getCurrentWorkspace } from "@cozy/platform-services/workspace-service";

export async function handlePlatformWorkspaceCurrentRoute(
  request: Request,
): Promise<Response> {
  const context = await getPlatformRequestContext(request);
  const result = await getCurrentWorkspace({ context });
  return Response.json(result.body, { status: result.status });
}
