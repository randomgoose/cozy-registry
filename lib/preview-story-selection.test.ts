import { describe, expect, it } from "vitest";
import { resolveSelectedPreviewStoryId } from "@/lib/preview-story-selection";

describe("preview story selection", () => {
  const stories = [
    { id: "default", title: "Default" },
    { id: "destructive", title: "Destructive" },
  ];

  it("keeps the current story when it is still available", () => {
    expect(
      resolveSelectedPreviewStoryId({
        currentStoryId: "destructive",
        stories,
        defaultStoryId: "default",
      }),
    ).toBe("destructive");
  });

  it("falls back to the declared default story when current disappears", () => {
    expect(
      resolveSelectedPreviewStoryId({
        currentStoryId: "missing",
        stories,
        defaultStoryId: "destructive",
      }),
    ).toBe("destructive");
  });

  it("falls back to the first story when there is no valid current or default", () => {
    expect(
      resolveSelectedPreviewStoryId({
        currentStoryId: null,
        stories,
        defaultStoryId: null,
      }),
    ).toBe("default");
  });
});
