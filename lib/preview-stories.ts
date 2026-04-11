export type PreviewStory = {
  id: string;
  title: string;
  export?: string;
  props?: Record<string, unknown>;
  description?: string;
  tags?: string[];
  code?: string;
  codeLanguage?: string;
  sourcePath?: string;
};

export function normalizePreviewStoriesInput(raw: unknown): PreviewStory[] {
  if (!Array.isArray(raw)) return [];
  const out: PreviewStory[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    if (!id || !title) continue;
    out.push({
      id,
      title,
      export: typeof rec.export === "string" && rec.export.trim() ? rec.export.trim() : undefined,
      props: rec.props && typeof rec.props === "object" && !Array.isArray(rec.props)
        ? (rec.props as Record<string, unknown>)
        : undefined,
      description:
        typeof rec.description === "string" ? rec.description : undefined,
      tags: Array.isArray(rec.tags)
        ? rec.tags.filter((t): t is string => typeof t === "string")
        : undefined,
      code:
        typeof rec.code === "string" && rec.code.trim().length > 0
          ? rec.code
          : typeof rec.sourceCode === "string" && rec.sourceCode.trim().length > 0
            ? rec.sourceCode
            : undefined,
      codeLanguage:
        typeof rec.codeLanguage === "string" && rec.codeLanguage.trim().length > 0
          ? rec.codeLanguage.trim()
          : undefined,
      sourcePath:
        typeof rec.sourcePath === "string" && rec.sourcePath.trim().length > 0
          ? rec.sourcePath.trim()
          : undefined,
    });
  }
  const seen = new Set<string>();
  return out.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

export function getPreviewStoriesFromMeta(meta: unknown): PreviewStory[] {
  if (!meta || typeof meta !== "object") return [];
  return normalizePreviewStoriesInput((meta as Record<string, unknown>).previewStories);
}

export function getPreviewDefaultStoryIdFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).previewDefaultStoryId;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

export function pickPreviewStory(meta: unknown, requestedStoryId: string | null) {
  const stories = getPreviewStoriesFromMeta(meta);
  if (stories.length === 0) {
    return { stories, selectedStory: null as PreviewStory | null };
  }
  const defaultId = getPreviewDefaultStoryIdFromMeta(meta);
  const targetId = requestedStoryId ?? defaultId ?? stories[0]?.id ?? null;
  const selectedStory = stories.find((s) => s.id === targetId) ?? stories[0] ?? null;
  return { stories, selectedStory };
}
