import { describe, expect, it } from "vitest";
import { runRegistryPreviewSmokeTest } from "@/lib/registry-preview-smoke";

describe("registry-preview-smoke examples", () => {
  it("supports default-export component", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "example-default-export",
      files: {
        "index.tsx": `
          import React from "react";
          export default function ExampleDefaultExport() {
            return <div>ok</div>;
          }
        `,
      },
    });
    expect(result.ok).toBe(true);
  });

  it("supports named export when previewExport is provided", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "example-named-export",
      previewExport: "ExampleNamedExport",
      files: {
        "index.tsx": `
          import React from "react";
          export function ExampleNamedExport() {
            return <div>named</div>;
          }
        `,
      },
    });
    expect(result.ok).toBe(true);
  });

  it("fails named export without previewExport/default export", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "example-named-export-fail",
      files: {
        "index.tsx": `
          import React from "react";
          export function TotallyDifferentName() {
            return <div>named</div>;
          }
        `,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PREVIEW_RENDER_FAILED");
    expect(result.message).toContain("No suitable component export found");
    expect(result.message).toContain("Detected exports");
  });

  it("supports client component with React.useState", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "example-client-usestate",
      files: {
        "index.tsx": `
          "use client";
          import * as React from "react";
          export default function ExampleClientUseState() {
            const [count] = React.useState(1);
            return <div>{count}</div>;
          }
        `,
      },
    });
    expect(result.ok).toBe(true);
  });

  it("supports radix-like namespace usage with third-party stubs", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "example-radix-namespace",
      files: {
        "index.tsx": `
          import React from "react";
          import * as Dropdown from "@radix-ui/react-dropdown-menu";
          export default function ExampleRadixNamespace() {
            return (
              <Dropdown.Root>
                <Dropdown.Trigger>Open</Dropdown.Trigger>
                <Dropdown.Content>
                  <Dropdown.Item>Item</Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Root>
            );
          }
        `,
      },
    });
    expect(result.ok).toBe(true);
  });

  it("blocks Node builtin imports for safety", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "example-node-builtin-block",
      files: {
        "index.tsx": `
          import React from "react";
          import fs from "node:fs";
          export default function ExampleNodeBuiltinBlock() {
            return <div>{String(Boolean(fs))}</div>;
          }
        `,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PREVIEW_BUILD_FAILED");
    expect(result.message).toContain("node:fs");
  });
});

