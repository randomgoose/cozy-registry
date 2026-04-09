import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  __previewSmokeInternals,
  runRegistryPreviewSmokeTest,
} from "@/lib/registry-preview-smoke";
import { evaluateThirdPartyDependencies } from "@/lib/third-party-dependency-governance";
import { resolvePreviewDependencies } from "@/lib/preview-dependency-provider";

const providerRootEnv = "COZY_PREVIEW_DEPENDENCY_PROVIDER_ROOT";
const hostFallbackEnv = "COZY_ENABLE_PREVIEW_HOST_FALLBACK";
const originalProviderRoot = process.env[providerRootEnv];
const originalHostFallback = process.env[hostFallbackEnv];

afterEach(() => {
  if (originalProviderRoot === undefined) {
    delete process.env[providerRootEnv];
  } else {
    process.env[providerRootEnv] = originalProviderRoot;
  }
  if (originalHostFallback === undefined) {
    delete process.env[hostFallbackEnv];
  } else {
    process.env[hostFallbackEnv] = originalHostFallback;
  }
});

async function primeProviderCacheForSmoke(
  decisions: ReturnType<typeof evaluateThirdPartyDependencies>,
) {
  const tmpRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "cozy-preview-smoke-provider-"),
  );
  process.env[providerRootEnv] = tmpRoot;
  process.env[hostFallbackEnv] = "true";
  await resolvePreviewDependencies({ decisions });
  delete process.env[hostFallbackEnv];
  return tmpRoot;
}

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

    if (!result.ok) {
      throw new Error(`${result.code}: ${result.message}`);
    }
    expect(result.ok).toBe(true);
  });

  it("passes a client component using React.useState", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "stateful-card",
      files: {
        "index.tsx": `
          "use client";
          import * as React from "react";
          export default function StatefulCard() {
            const [count] = React.useState(1);
            return <div>{count}</div>;
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
  });

  it("passes a client component using named useEffect import", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "effect-card",
      files: {
        "index.tsx": `
          "use client";
          import React, { useEffect } from "react";
          export default function EffectCard() {
            useEffect(() => {}, []);
            return <div>ok</div>;
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

  it("allows third-party bare modules via smoke stubs", async () => {
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

    expect(result.ok).toBe(true);
  });

  it("supports namespace imports from third-party stubs", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "namespace-dep-card",
      files: {
        "index.tsx": `
          import React from "react";
          import * as Fancy from "totally-unknown-package";
          export default function NamespaceDepCard() {
            return <Fancy.Root><Fancy.Item /></Fancy.Root>;
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
  });

  it("resolves prebundle-supported packages through governance instead of stubbing them", async () => {
    const dependencyDecisions = evaluateThirdPartyDependencies({
      discovered: ["class-variance-authority"],
      declared: [{ name: "class-variance-authority", version: "0.7.1" }],
    });
    const tmpRoot = await primeProviderCacheForSmoke(dependencyDecisions);
    const result = await runRegistryPreviewSmokeTest({
      name: "cva-card",
      dependencyDecisions,
      files: {
        "index.tsx": `
          import React from "react";
          import { cva } from "class-variance-authority";
          const button = cva("base");
          export default function CvaCard() {
            if (typeof button !== "function") {
              throw new Error("cva not real");
            }
            return <div className={button()}>ok</div>;
          }
        `,
      },
    });

    if (!result.ok) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      throw new Error(`${result.code}: ${result.message}`);
    }
    expect(result.ok).toBe(true);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("supports shadcn-style button components that mix radix slot and cva", async () => {
    const dependencyDecisions = evaluateThirdPartyDependencies({
      discovered: ["@radix-ui/react-slot", "class-variance-authority"],
      declared: [{ name: "class-variance-authority", version: "0.7.1" }],
    });
    const tmpRoot = await primeProviderCacheForSmoke(dependencyDecisions);
    const result = await runRegistryPreviewSmokeTest({
      name: "button",
      dependencyDecisions,
      files: {
        "utils.ts": `
          export function cn(...parts: Array<string | null | undefined | false>) {
            return parts.filter(Boolean).join(" ");
          }
        `,
        "index.tsx": `
          import * as React from "react";
          import { Slot } from "@radix-ui/react-slot";
          import { cva, type VariantProps } from "class-variance-authority";
          import { cn } from "./utils";

          const buttonVariants = cva("base", {
            variants: {
              variant: {
                default: "primary",
              },
              size: {
                default: "md",
              },
            },
            defaultVariants: {
              variant: "default",
              size: "default",
            },
          });

          function Button({
            className,
            variant,
            size,
            asChild = false,
            ...props
          }: React.ComponentProps<"button"> &
            VariantProps<typeof buttonVariants> & {
              asChild?: boolean;
            }) {
            const Comp = asChild ? Slot : "button";

            return (
              <Comp
                data-slot="button"
                className={cn(buttonVariants({ variant, size, className }))}
                {...props}
              />
            );
          }

          export default Button;
        `,
      },
    });

    if (!result.ok) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      throw new Error(`${result.code}: ${result.message}`);
    }
    expect(result.ok).toBe(true);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("treats @/ bundle aliases as local files instead of third-party deps", async () => {
    const result = await runRegistryPreviewSmokeTest({
      name: "alias-card",
      files: {
        "lib/utils.ts": `
          export function cn(...parts: Array<string | false | null | undefined>) {
            return parts.filter(Boolean).join(" ");
          }
        `,
        "index.tsx": `
          import React from "react";
          import { cn } from "@/lib/utils";

          export default function AliasCard() {
            return <div className={cn("alpha", "beta")}>ok</div>;
          }
        `,
      },
    });

    if (!result.ok) {
      throw new Error(`${result.code}: ${result.message}`);
    }
    expect(result.ok).toBe(true);
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
