import { getPlatformRequestContext } from "@cozy/auth-control/platform-auth";
import {
  addItemToProject,
  createProjectFromBody,
  deleteProject,
  listProjectItems,
  listProjects,
  removeItemFromProject,
  updateProjectFromBody,
} from "@cozy/platform-services/project-service";

export async function handlePlatformProjectsRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);

  if (request.method === "GET") {
    const result = await listProjects({
      context,
      owner: url.searchParams.get("owner"),
    });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof createProjectFromBody
    >[0]["body"];
    const result = await createProjectFromBody({ context, body });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformProjectDetailRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [id] = url.pathname
    .replace(/^\/projects\//, "")
    .split("/")
    .filter(Boolean);

  if (!id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof updateProjectFromBody
    >[0]["body"];
    const result = await updateProjectFromBody({ context, id, body });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "DELETE") {
    const result = await deleteProject({ context, id });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformProjectItemsRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [id, suffix] = url.pathname
    .replace(/^\/projects\//, "")
    .split("/")
    .filter(Boolean);

  if (!id || suffix !== "items") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "GET") {
    const result = await listProjectItems({ context, id });
    return Response.json(result.body, { status: result.status });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof addItemToProject
    >[0]["body"];
    const result = await addItemToProject({ context, id, body });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function handlePlatformProjectItemDetailRoute(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const context = await getPlatformRequestContext(request);
  const [id, suffix, itemId] = url.pathname
    .replace(/^\/projects\//, "")
    .split("/")
    .filter(Boolean);

  if (!id || suffix !== "items" || !itemId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "DELETE") {
    const result = await removeItemFromProject({ context, id, itemId });
    return Response.json(result.body, { status: result.status });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
