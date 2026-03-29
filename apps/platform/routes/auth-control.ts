import {
  forwardAuthControlRequest,
  getAuthControlProfile,
  getAuthControlSession,
  getTeamRouteResolution,
  getWorkspaceScopeContext,
  postAuthControlHandle,
  postEnsureTeamSlug,
} from "@cozy/auth-control/auth-control-service";

export async function handlePlatformAuthControlSessionRoute(
  request: Request,
): Promise<Response> {
  return getAuthControlSession(request);
}

export async function handlePlatformAuthControlProfileRoute(
  request: Request,
): Promise<Response> {
  return getAuthControlProfile(request);
}

export async function handlePlatformAuthControlWorkspaceContextRoute(
  request: Request,
): Promise<Response> {
  return getWorkspaceScopeContext(request);
}

export async function handlePlatformAuthControlTeamResolveRoute(
  request: Request,
): Promise<Response> {
  return getTeamRouteResolution(request);
}

export async function handlePlatformAuthControlTeamEnsureSlugRoute(
  request: Request,
): Promise<Response> {
  return postEnsureTeamSlug(request);
}

export async function handlePlatformAuthControlHandleRoute(
  request: Request,
): Promise<Response> {
  return postAuthControlHandle(request);
}

export async function handlePlatformAuthControlOrganizationRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = `${url.pathname.replace(/^\/auth-control/, "")}${url.search}`;
  return forwardAuthControlRequest(request, path);
}

export async function handlePlatformAuthControlApiKeyRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = `${url.pathname.replace(/^\/auth-control/, "")}${url.search}`;
  return forwardAuthControlRequest(request, path);
}

export async function handlePlatformAuthControlSignInRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = `${url.pathname.replace(/^\/auth-control/, "")}${url.search}`;
  return forwardAuthControlRequest(request, path);
}

export async function handlePlatformAuthControlSignUpRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = `${url.pathname.replace(/^\/auth-control/, "")}${url.search}`;
  return forwardAuthControlRequest(request, path);
}
