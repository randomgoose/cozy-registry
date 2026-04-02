import { describe, expect, it } from "vitest";
import { buildPreviewBundle } from "@/lib/preview-build";

describe("preview-build", () => {
  it("bundles installed third-party dependencies for artifact builds", async () => {
    const result = await buildPreviewBundle(
      {
        name: "icon-card",
        version: "1.0.0",
        files: {
          "default.story.tsx": `
            import React from "react";
            import { Circle } from "lucide-react";

            export default function DefaultStory() {
              return <Circle />;
            }
          `,
          "index.tsx": `export { default } from "./default.story";`,
        },
        dependencies: ["lucide-react"],
      },
      {},
      { externalizeDependencies: false },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("createLucideIcon");
    expect(result.code).not.toContain(`from "lucide-react"`);
  });
});
