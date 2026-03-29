import { getCanonicalBaseUrlFromRequest } from "@cozy/oauth/oauth";
import {
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
} from "@cozy/oauth/oauth-metadata";

export async function handlePlatformOAuthAuthorizationServerMetadataRoute(
  request: Request,
): Promise<Response> {
  const baseUrl = getCanonicalBaseUrlFromRequest(request);
  return Response.json(getAuthorizationServerMetadata(baseUrl), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function handlePlatformOAuthProtectedResourceMetadataRoute(
  request: Request,
): Promise<Response> {
  const baseUrl = getCanonicalBaseUrlFromRequest(request);
  return Response.json(getProtectedResourceMetadata(baseUrl), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
