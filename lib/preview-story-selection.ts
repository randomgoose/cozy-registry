import type { PreviewStory } from "@/lib/preview-stories";

export function resolveSelectedPreviewStoryId(input: {
  currentStoryId: string | null;
  stories: PreviewStory[];
  defaultStoryId: string | null;
}) {
  const normalizedCurrent = input.currentStoryId?.trim() || null;
  const normalizedDefault = input.defaultStoryId?.trim() || null;
  const availableStoryIds = new Set(
    input.stories.map((story) => story.id.trim()).filter(Boolean),
  );

  if (normalizedCurrent && availableStoryIds.has(normalizedCurrent)) {
    return normalizedCurrent;
  }
  if (normalizedDefault && availableStoryIds.has(normalizedDefault)) {
    return normalizedDefault;
  }
  return input.stories[0]?.id ?? null;
}
