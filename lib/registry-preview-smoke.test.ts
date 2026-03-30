import { describe, expect, it } from "vitest";
import {
  __previewSmokeInternals,
  runRegistryPreviewSmokeTest,
} from "@/lib/registry-preview-smoke";

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

  it("fails when importing Node built-in modules", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "builtin-module-card",
      files: {
        "index.tsx": `
          import React from "react";
          import fs from "node:fs";
          export default function BuiltinModuleCard() {
            return <div>{String(!!fs)}</div>;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PREVIEW_BUILD_FAILED");
    expect(result.message).toContain("Unsupported bare module imports");
    expect(result.message).toContain("node:fs");
  });

  it("blocks access to process in smoke runtime", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "process-access-card",
      files: {
        "index.tsx": `
          import React from "react";
          export default function ProcessAccessCard() {
            return <div>{process.env.NODE_ENV}</div>;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PREVIEW_RENDER_FAILED");
    expect(result.message).toContain("process is not defined");
  });

});

describe("registry-preview-smoke internals", () => {
  it("times out unresolved work", async () => {
    const never = new Promise<string>(() => {
      // Never resolves.
    });
    const started = Date.now();
    const result = await __previewSmokeInternals.withTimeout(
      never,
      30,
      () => "timeout-value",
    );
    const elapsed = Date.now() - started;

    expect(result).toBe("timeout-value");
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });

  it("adds actionable hint for invalid element type failures", () => {
    const message = __previewSmokeInternals.withSmokeFailureHint(
      "Element type is invalid: expected a string or class/function.",
    );
    expect(message).toContain("Hint:");
    expect(message).toContain("default/named exports");
  });
});
