import {
  addItemToProject,
  createProjectFromBody,
  deleteProject,
  listProjectItems,
  listProjects,
  removeItemFromProject,
  updateProjectFromBody,
} from "./project-service";

function remapProjectKeys(body: Record<string, unknown>) {
  const normalized = {
    ...body,
    ...(body.error === "Project slug already exists"
      ? { error: "Collection slug already exists" }
      : {}),
  };

  if ("projects" in normalized) {
    const { projects, ...rest } = normalized;
    return {
      ...rest,
      collections: projects,
    };
  }

  if ("project" in normalized) {
    const { project, ...rest } = normalized;
    return {
      ...rest,
      collection: project,
    };
  }

  return normalized;
}

// Compatibility layer:
// collections remains an alias for older clients, but persistence now lives
// in the real projects/project_items tables.
export async function listCollections(input: Parameters<typeof listProjects>[0]) {
  const result = await listProjects(input);
  return {
    ...result,
    body: remapProjectKeys(result.body as Record<string, unknown>),
  };
}

export async function createCollectionFromBody(
  input: Parameters<typeof createProjectFromBody>[0],
) {
  const result = await createProjectFromBody(input);
  return {
    ...result,
    body: remapProjectKeys(result.body as Record<string, unknown>),
  };
}

export async function listCollectionItems(
  input: Parameters<typeof listProjectItems>[0],
) {
  return listProjectItems(input);
}

export async function addItemToCollection(
  input: Parameters<typeof addItemToProject>[0],
) {
  return addItemToProject(input);
}

export async function updateCollectionFromBody(
  input: Parameters<typeof updateProjectFromBody>[0],
) {
  const result = await updateProjectFromBody(input);
  return {
    ...result,
    body: remapProjectKeys(result.body as Record<string, unknown>),
  };
}

export async function deleteCollection(input: Parameters<typeof deleteProject>[0]) {
  return deleteProject(input);
}

export async function removeItemFromCollection(
  input: Parameters<typeof removeItemFromProject>[0],
) {
  return removeItemFromProject(input);
}
