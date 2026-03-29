import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import {
  getRegistryConsumptionPayload,
  listOwnedRegistryItems,
  listRegistryCatalog,
  lookupRegistryItemByName,
  parseRegistrySpecSegments,
} from "@cozy/platform-services/registry-service";
import { getSessionContextFromHeaders } from "@cozy/auth-control/platform-auth";
import {
  createRegistryItemVersionFromBody,
  deleteRegistryItemByOwner,
  getRegistryItemMetadata,
  getRegistryItemVersionSummary,
  updateRegistryItemVisibilityByOwner,
} from "@cozy/platform-services/registry-item-service";
import { createRegistryItemFromBody } from "@cozy/platform-services/registry-write-service";

export async function handlePlatformRegistryCatalogRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const payload = await listRegistryCatalog({
    context,
    searchParams: url.searchParams,
    homepage: process.env.NEXT_PUBLIC_APP_URL ?? url.origin,
  });

  return Response.json(payload);
}

export async function handlePlatformRegistryConsumptionRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const spec = url.pathname
    .replace(/^\/r\//, "")
    .split("/")
    .filter(Boolean);
  const { owner, name } = parseRegistrySpecSegments(spec);
  if (!name) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const context = await getPlatformRequestContext(request);
  const payload = await getRegistryConsumptionPayload({
    context,
    owner,
    name,
    version: url.searchParams.get("v"),
  });

  if (!payload) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(payload);
}

export async function handlePlatformRegistryItemsCreateRoute(
  request: Request,
): Promise<Response> {
  const context = await getPlatformRequestContext(request);
  const body = (await request.json()) as Parameters<
    typeof createRegistryItemFromBody
  >[0]["body"];
  const result = await createRegistryItemFromBody({ body, context });
  return Response.json(result.body, { status: result.status });
}

export async function handlePlatformRegistryOwnedItemsRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const result = await listOwnedRegistryItems({
    context,
    teamId: url.searchParams.get("teamId"),
  });
  return Response.json(result.body, { status: result.status });
}

export async function handlePlatformRegistryLookupRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) {
    return Response.json({ error: "Missing name" }, { status: 400 });
  }

  const context = await getPlatformRequestContext(request);
  const result = await lookupRegistryItemByName({ name, context });
  if (!result) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(result);
}

export async function handlePlatformRegistryItemDetailRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/registry\//, "").split("/").filter(Boolean);
  const [owner, name] = segments;
  if (!owner || !name) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "GET") {
    const session = await getSessionContextFromHeaders(request.headers);
    const item = await getRegistryItemMetadata({ owner, name, session });
    if (!item) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(item);
  }

  const context = await getPlatformRequestContext(request);
  if (request.method === "DELETE") {
    const result = await deleteRegistryItemByOwner({ owner, name, context });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "PATCH") {
    const body = await request.json().catch(() => ({} as unknown));
    const visibility =
      body &&
      typeof body === "object" &&
      (body as { visibility?: unknown }).visibility === "private"
        ? "private"
        : "public";
    const result = await updateRegistryItemVisibilityByOwner({
      owner,
      name,
      visibility,
      context,
    });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformRegistryItemVersionsRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname
    .replace(/^\/registry\//, "")
    .split("/")
    .filter(Boolean);
  const [owner, name, suffix] = segments;
  if (!owner || !name || suffix !== "versions") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "GET") {
    const session = await getSessionContextFromHeaders(request.headers);
    const result = await getRegistryItemVersionSummary({ owner, name, session });
    if (!result) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(result);
  }

  if (request.method === "POST") {
    const context = await getPlatformRequestContext(request);
    const body = (await request.json()) as Parameters<
      typeof createRegistryItemVersionFromBody
    >[0]["body"];
    const result = await createRegistryItemVersionFromBody({
      owner,
      name,
      body,
      context,
    });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
