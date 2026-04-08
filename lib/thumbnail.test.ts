import { describe, expect, it } from "vitest";
import { getPreviewCapturePlan } from "@/lib/thumbnail";

describe("thumbnail", () => {
  it("includes project scope in preview capture paths", () => {
    const plan = getPreviewCapturePlan({
      owner: "indeed-cozy",
      project: "design-system",
      name: "button",
      version: "1.2.3",
    });

    expect(plan.previewPath).toBe(
      "/preview/indeed-cozy/button?v=1.2.3&thumbnail=1&project=design-system",
    );
  });

  it("omits project query when item is not project scoped", () => {
    const plan = getPreviewCapturePlan({
      owner: "indeed-cozy",
      name: "button",
      version: "1.2.3",
    });

    expect(plan.previewPath).toBe(
      "/preview/indeed-cozy/button?v=1.2.3&thumbnail=1",
    );
  });
});
