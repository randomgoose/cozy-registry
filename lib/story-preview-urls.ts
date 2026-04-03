export function buildStoryPreviewPageUrl(input: {
  owner: string;
  name: string;
  version?: string | null;
  storyId?: string | null;
}) {
  const base = `/preview/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}`;
  const search = new URLSearchParams();
  const version = input.version?.trim();
  const storyId = input.storyId?.trim();

  if (version) {
    search.set("v", version);
  }
  if (storyId) {
    search.set("story", storyId);
  }

  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

export function buildStoryPreviewArtifactStatusQuery(input: {
  owner: string;
  name: string;
  version?: string | null;
  project?: string | null;
  storyId?: string | null;
  mode?: "default" | "thumbnail";
  enqueue?: boolean;
}) {
  const search = new URLSearchParams({
    owner: input.owner,
    name: input.name,
  });
  const version = input.version?.trim();
  const project = input.project?.trim();
  const storyId = input.storyId?.trim();
  const mode = input.mode === "thumbnail" ? "thumbnail" : "default";

  if (version) {
    search.set("v", version);
  }
  if (project) {
    search.set("project", project);
  }
  if (storyId) {
    search.set("story", storyId);
  }
  if (mode !== "default") {
    search.set("mode", mode);
  }
  if (input.enqueue) {
    search.set("enqueue", "1");
  }

  return search;
}
