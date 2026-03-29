import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import {
  renderPreviewResponse,
  resolveLegacyPreviewRedirect,
} from "@cozy/platform-services/preview-service";

export async function handlePlatformPreviewRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/preview\//, "").split("/").filter(Boolean);
  const context = await getPlatformRequestContext(request);

  if (segments.length === 1) {
    const legacy = await resolveLegacyPreviewRedirect({
      context,
      nameFromPath: segments[0] ?? "",
    });
    if (!legacy) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.redirect(
      new URL(`/preview/${legacy.owner}/${legacy.itemName}`, request.url),
    );
  }

  if (segments.length >= 2) {
    const [owner, name] = segments;
    return renderPreviewResponse({
      request,
      owner: owner ?? "",
      name: name ?? "",
      context,
    });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
