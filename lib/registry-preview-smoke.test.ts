import { describe, expect, it } from "vitest";
import { runRegistryPreviewSmokeTest } from "@/lib/registry-preview-smoke";

describe("registry-preview-smoke", () => {
  it("passes a simple renderable component", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "hello-card",
      files: {
        "index.tsx": `
          import React from "react";
          export default function HelloCard() {
            return <div>Hello</div>;
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
  });

  it("fails when the component renders an undefined child", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "kpi-card",
      files: {
        "index.tsx": `
          import React from "react";
          const Missing = undefined as unknown as React.ComponentType;
          export default function KPICard() {
            return <Missing />;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PREVIEW_RENDER_FAILED");
    expect(result.message).toContain("Element type is invalid");
  });

  it("fails when importing unsupported bare modules", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "unknown-dep-card",
      files: {
        "index.tsx": `
          import React from "react";
          import { Nope } from "totally-unknown-package";
          export default function UnknownDepCard() {
            return <Nope />;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PREVIEW_BUILD_FAILED");
    expect(result.message).toContain("Unsupported bare module imports");
    expect(result.message).toContain("totally-unknown-package");
  });
});
