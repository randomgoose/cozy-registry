import {
  addItemToCollection,
  createCollectionFromBody,
  deleteCollection,
  listCollectionItems,
  listCollections,
  removeItemFromCollection,
  updateCollectionFromBody,
} from "./collections-service";

function remapCollectionKeys(body: Record<string, unknown>) {
  if ("collections" in body) {
    const { collections, ...rest } = body;
    return {
      ...rest,
      projects: collections,
    };
  }

  if ("collection" in body) {
    const { collection, ...rest } = body;
    return {
      ...rest,
      project: collection,
    };
  }

  return body;
}

export async function listProjects(
  input: Parameters<typeof listCollections>[0],
) {
  const result = await listCollections(input);
  return {
    ...result,
    body: remapCollectionKeys(result.body as Record<string, unknown>),
  };
}

export async function createProjectFromBody(
  input: Parameters<typeof createCollectionFromBody>[0],
) {
  const result = await createCollectionFromBody(input);
  return {
    ...result,
    body: remapCollectionKeys(result.body as Record<string, unknown>),
  };
}

export async function listProjectItems(
  input: Parameters<typeof listCollectionItems>[0],
) {
  return listCollectionItems(input);
}

export async function addItemToProject(
  input: Parameters<typeof addItemToCollection>[0],
) {
  return addItemToCollection(input);
}

export async function updateProjectFromBody(
  input: Parameters<typeof updateCollectionFromBody>[0],
) {
  const result = await updateCollectionFromBody(input);
  return {
    ...result,
    body: remapCollectionKeys(result.body as Record<string, unknown>),
  };
}

export async function deleteProject(
  input: Parameters<typeof deleteCollection>[0],
) {
  return deleteCollection(input);
}

export async function removeItemFromProject(
  input: Parameters<typeof removeItemFromCollection>[0],
) {
  return removeItemFromCollection(input);
}
