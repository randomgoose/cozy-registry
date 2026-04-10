export async function linkRegistryItemToProject(params: {
  userId: string;
  projectId: string;
  itemId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  void params;
  return {
    ok: false,
    error:
      "Attach-to-project is no longer supported. Publish or move resources as canonical project-scoped items instead.",
  };
}
