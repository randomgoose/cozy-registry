import { auth } from "@cozy/auth-runtime/auth";

export async function handlePlatformAuthRoute(request: Request): Promise<Response> {
  return auth.handler(request);
}
