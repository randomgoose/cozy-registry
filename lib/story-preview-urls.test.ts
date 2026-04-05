import { describe, expect, it } from "vitest";
import {
  buildMultiStoryPreviewPageUrl,
  buildStoryPreviewArtifactStatusQuery,
  buildStoryPreviewPageUrl,
} from "@/lib/story-preview-urls";

describe("story preview urls", () => {
  it("builds a story-aware preview page url", () => {
    expect(
      buildStoryPreviewPageUrl({
        owner: "indeed-cozy",
        name: "button",
        project: "dashboard",
        version: "1.2.3",
        storyId: "destructive",
      }),
    ).toBe("/preview/indeed-cozy/button?project=dashboard&v=1.2.3&story=destructive");
  });

  it("omits empty story and version params", () => {
    expect(
      buildStoryPreviewPageUrl({
        owner: "indeed-cozy",
        name: "button",
        version: null,
        storyId: "  ",
      }),
    ).toBe("/preview/indeed-cozy/button");
  });

  it("builds a docs-style multi-story preview url", () => {
    expect(
      buildMultiStoryPreviewPageUrl({
        owner: "indeed-cozy",
        name: "dialog",
        project: "ds",
        version: "0.1.0",
        storyId: "default",
        theme: "dark",
      }),
    ).toBe(
      "/preview/indeed-cozy/dialog/stories?project=ds&v=0.1.0&story=default&theme=dark",
    );
  });

  it("builds a story-aware artifact status query with enqueue", () => {
    expect(
      buildStoryPreviewArtifactStatusQuery({
        owner: "indeed-cozy",
        name: "button",
        version: "1.2.3",
        storyId: "destructive",
        enqueue: true,
      }).toString(),
    ).toBe("owner=indeed-cozy&name=button&v=1.2.3&story=destructive&enqueue=1");
  });
});
