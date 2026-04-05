export function buildStoryPreviewPageUrl(input: {
  owner: string;
  name: string;
  project?: string | null;
  version?: string | null;
  storyId?: string | null;
  theme?: string | null;
}) {
  const base = `/preview/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}`;
  const search = new URLSearchParams();
  const project = input.project?.trim();
  const version = input.version?.trim();
  const storyId = input.storyId?.trim();
  const theme = input.theme?.trim();

  if (project) {
    search.set("project", project);
  }
  if (version) {
    search.set("v", version);
  }
  if (storyId) {
    search.set("story", storyId);
  }
  if (theme) {
    search.set("theme", theme);
  }

  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

export function buildMultiStoryPreviewPageUrl(input: {
  owner: string;
  name: string;
  project?: string | null;
  version?: string | null;
  storyId?: string | null;
  theme?: string | null;
}) {
  const base = `/preview/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}/stories`;
  const search = new URLSearchParams();
  const project = input.project?.trim();
  const version = input.version?.trim();
  const storyId = input.storyId?.trim();
  const theme = input.theme?.trim();

  if (project) {
    search.set("project", project);
  }
  if (version) {
    search.set("v", version);
  }
  if (storyId) {
    search.set("story", storyId);
  }
  if (theme) {
    search.set("theme", theme);
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
