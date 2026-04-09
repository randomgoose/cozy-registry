import fs from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runRegistryPreviewSmokeTest } from "@/lib/registry-preview-smoke";
import {
  getPrebundleDependencies,
  evaluateThirdPartyDependencies,
} from "@/lib/third-party-dependency-governance";
import {
  __previewDependencyProviderInternals,
  getPreviewDependencyHostNodePaths,
} from "@/lib/preview-dependency-provider";

const providerRootEnv = "COZY_PREVIEW_DEPENDENCY_PROVIDER_ROOT";
const originalProviderRoot = process.env[providerRootEnv];

afterEach(() => {
  if (originalProviderRoot === undefined) {
    delete process.env[providerRootEnv];
  } else {
    process.env[providerRootEnv] = originalProviderRoot;
  }
});

async function primeProviderCacheForSmoke(
  decisions: ReturnType<typeof evaluateThirdPartyDependencies>,
) {
  const tmpRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "cozy-preview-smoke-examples-provider-"),
  );
  process.env[providerRootEnv] = tmpRoot;
  const appRequire = Module.createRequire(
    path.join(process.cwd(), "package.json"),
  );
  const hostNodePaths = getPreviewDependencyHostNodePaths(appRequire);
  const byName = new Map(decisions.map((decision) => [decision.packageName, decision]));
  for (const packageName of getPrebundleDependencies(decisions)) {
    const requestedVersion = byName.get(packageName)?.requestedVersion?.trim();
    if (!requestedVersion) continue;
    await __previewDependencyProviderInternals.seedProviderFromHost({
      appRequire,
      packageName,
      requestedVersion,
      providerRoot: tmpRoot,
      hostNodePaths,
    });
  }
  return tmpRoot;
}

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

  it("supports governance-approved prebundle deps (e.g. cva) when an explicit version is declared", async () => {
    const dependencyDecisions = evaluateThirdPartyDependencies({
      discovered: ["class-variance-authority"],
      declared: [{ name: "class-variance-authority", version: "0.7.1" }],
    });
    const tmpRoot = await primeProviderCacheForSmoke(dependencyDecisions);

    const result = await runRegistryPreviewSmokeTest({
      name: "example-cva-prebundle-supported",
      dependencyDecisions,
      files: {
        "index.tsx": `
          import React from "react";
          import { cva } from "class-variance-authority";

          const buttonVariants = cva("base");

          export default function ExampleCvaPrebundleSupported() {
            if (typeof buttonVariants !== "function") {
              throw new Error("Expected buttonVariants to be a function (real cva), but got: " + String(typeof buttonVariants));
            }
            return <button className={buttonVariants()}>ok</button>;
          }
        `,
      },
    });

    await fs.rm(tmpRoot, { recursive: true, force: true });
    expect(result.ok).toBe(true);
  });

  it("fails cva usage when version is not explicitly declared (downgraded to runtime-only, stubbed in smoke)", async () => {
    const dependencyDecisions = evaluateThirdPartyDependencies({
      discovered: ["class-variance-authority"],
      declared: [],
    });

    const result = await runRegistryPreviewSmokeTest({
      name: "example-cva-version-unknown-runtime-only",
      dependencyDecisions,
      files: {
        "index.tsx": `
          import React from "react";
          import { cva } from "class-variance-authority";

          const buttonVariants = cva("base");

          export default function ExampleCvaVersionUnknown() {
            return <button className={buttonVariants()}>ok</button>;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PREVIEW_RENDER_FAILED");
    expect(result.message).toContain("buttonVariants is not a function");
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
