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

    if (!result.ok) {
      throw new Error(result.error.message);
    }
    if (!result.ok) return;
    expect(result.code).toContain("createLucideIcon");
    expect(result.code).not.toContain(`from "lucide-react"`);
  });

  it("resolves bundle-local @/ aliases from the preview workspace root", async () => {
    const result = await buildPreviewBundle(
      {
        name: "alias-card",
        version: "1.0.0",
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
              return <div className={cn("hello", "world")}>ok</div>;
            }
          `,
        },
      },
      {},
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("hello");
    expect(result.code).not.toContain(`from "@/lib/utils"`);
  });

  it("resolves bundle-local @/ aliases from nested installed bundle roots", async () => {
    const result = await buildPreviewBundle(
      {
        name: "dialog",
        version: "1.0.0",
        files: {
          "index.tsx": `
            export { default } from "./src/components/registry/indeed-cozy/dialog/index";
          `,
          "src/components/registry/indeed-cozy/dialog/lib/utils.ts": `
            export function cn(...parts: Array<string | false | null | undefined>) {
              return parts.filter(Boolean).join(" ");
            }
          `,
          "src/components/registry/indeed-cozy/dialog/index.tsx": `
            import React from "react";
            import { cn } from "@/lib/utils";

            export default function Dialog() {
              return <div className={cn("dialog", "open")}>ok</div>;
            }
          `,
        },
      },
      {},
    );

    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.code).toContain("dialog");
    expect(result.code).not.toContain(`from "@/lib/utils"`);
  });

  it("externalizes scoped preview dependencies for compatible artifacts", async () => {
    const result = await buildPreviewBundle(
      {
        name: "dropdown-card",
        version: "1.0.0",
        files: {
          "index.tsx": `
            import React from "react";
            import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

            export default function DropdownCard() {
              return <DropdownMenu.Root />;
            }
          `,
        },
        dependencies: ["@radix-ui/react-dropdown-menu"],
      },
      {},
      { externalizeDependencies: true, bundleReact: false },
    );

    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.code).toContain(`from "@radix-ui/react-dropdown-menu"`);
  });

  it("builds baseline Tailwind utility css for static className usage", async () => {
    const result = await buildPreviewBundle(
      {
        name: "tailwind-card",
        version: "1.0.0",
        files: {
          "index.tsx": `
            import React from "react";

            export default function TailwindCard() {
              return (
                <div className="flex rounded-md bg-red-500 p-4 text-white">
                  hello
                </div>
              );
            }
          `,
        },
      },
      {},
    );

    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.css).toContain(".flex");
    expect(result.css).toContain(".bg-red-500");
    expect(result.css).toContain(".p-4");
  });

  it("builds baseline Tailwind utility css for cva variant definitions", async () => {
    const result = await buildPreviewBundle(
      {
        name: "tailwind-cva-button",
        version: "1.0.0",
        files: {
          "index.tsx": `
            import React from "react";
            import { cva } from "class-variance-authority";

            const buttonVariants = cva(
              "inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground",
              {
                variants: {
                  variant: {
                    outline: "border border-border bg-background text-foreground",
                  },
                },
              }
            );

            export default function TailwindCvaButton() {
              return <button className={buttonVariants({ variant: "outline" })}>Hello</button>;
            }
          `,
        },
        dependencies: ["class-variance-authority"],
      },
      {},
      { externalizeDependencies: false },
    );

    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.css).toContain(".inline-flex");
    expect(result.css).toContain(".bg-primary");
    expect(result.css).toContain(".border-border");
    expect(result.css).toContain(".text-primary-foreground");
  });
});
