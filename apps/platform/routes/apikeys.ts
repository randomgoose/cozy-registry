import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import {
  deleteRegistryApiKeyPolicy,
  getRegistryApiKeyPolicy,
  putRegistryApiKeyPolicy,
  type RegistryApiKeyPolicyBody,
} from "@cozy/platform-services/apikey-policy-service";

export async function handlePlatformApiKeyPolicyRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/apikeys\//, "").split("/").filter(Boolean);
  const [apiKeyId, suffix] = segments;
  if (!apiKeyId || suffix !== "policy") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const context = await getPlatformRequestContext(request);

  if (request.method === "GET") {
    const result = await getRegistryApiKeyPolicy({ context, apiKeyId });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "PUT") {
    const body = (await request.json().catch(() => null)) as RegistryApiKeyPolicyBody | null;
    const result = await putRegistryApiKeyPolicy({ context, apiKeyId, body });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "DELETE") {
    const result = await deleteRegistryApiKeyPolicy({ context, apiKeyId });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
