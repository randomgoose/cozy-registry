import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import {
  addItemToCollection,
  createCollectionFromBody,
  deleteCollection,
  listCollectionItems,
  listCollections,
  removeItemFromCollection,
  updateCollectionFromBody,
} from "@cozy/platform-services/collections-service";

export async function handlePlatformCollectionsRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);

  if (request.method === "GET") {
    const result = await listCollections({
      context,
      owner: url.searchParams.get("owner"),
    });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof createCollectionFromBody
    >[0]["body"];
    const result = await createCollectionFromBody({ context, body });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformCollectionDetailRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [id] = url.pathname
    .replace(/^\/collections\//, "")
    .split("/")
    .filter(Boolean);

  if (!id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof updateCollectionFromBody
    >[0]["body"];
    const result = await updateCollectionFromBody({ context, id, body });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "DELETE") {
    const result = await deleteCollection({ context, id });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformCollectionItemsRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [id, suffix] = url.pathname
    .replace(/^\/collections\//, "")
    .split("/")
    .filter(Boolean);

  if (!id || suffix !== "items") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "GET") {
    const result = await listCollectionItems({ context, id });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof addItemToCollection
    >[0]["body"];
    const result = await addItemToCollection({ context, id, body });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformCollectionItemDetailRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [id, suffix, itemId] = url.pathname
    .replace(/^\/collections\//, "")
    .split("/")
    .filter(Boolean);

  if (!id || suffix !== "items" || !itemId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "DELETE") {
    const result = await removeItemFromCollection({ context, id, itemId });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
