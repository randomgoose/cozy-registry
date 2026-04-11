import { describe, expect, it } from "vitest";
import { materializeInstalledRegistryFilesFromResolvedGraph } from "@/lib/registry-install-layout";

describe("registry install layout helpers", () => {
  it("materializes a flat installed file tree and rewrites root imports to sibling items", () => {
    const result = materializeInstalledRegistryFilesFromResolvedGraph([
      {
        ref: {
          owner: "alice",
          projectKey: null,
          name: "button",
          version: "1.0.0",
          ref: "@alice/button@1.0.0",
        },
        item: {
          type: "registry:ui",
          registryDependencies: [],
          files: [{ path: "index.tsx", content: "export function Button() { return <button />; }" }],
        },
      },
      {
        ref: {
          owner: "alice",
          projectKey: null,
          name: "dialog",
          version: "1.0.0",
          ref: "@alice/dialog@1.0.0",
        },
        item: {
          type: "registry:block",
          registryDependencies: ["@alice/button"],
          files: [
            {
              path: "index.tsx",
              content:
                'import { Button } from "@alice/button";\nexport function Dialog() { return <Button />; }',
            },
          ],
        },
      },
    ]);

    expect(result.files["src/components/registry/alice/button/index.tsx"]).toContain("Button");
    expect(result.files["src/components/registry/alice/dialog/index.tsx"]).toContain(
      'from "../button/index"',
    );
    expect(result.rootEntries["@alice/dialog@1.0.0"]).toBe(
      "src/components/registry/alice/dialog/index",
    );
  });

  it("rewrites missing relative imports to a uniquely named direct dependency in preview/install layout", () => {
    const result = materializeInstalledRegistryFilesFromResolvedGraph([
      {
        ref: {
          owner: "alice",
          projectKey: null,
          name: "button",
          version: "1.0.0",
          ref: "@alice/button@1.0.0",
        },
        item: {
          type: "registry:ui",
          registryDependencies: [],
          files: [{ path: "index.tsx", content: "export function Button() { return <button />; }" }],
        },
      },
      {
        ref: {
          owner: "alice",
          projectKey: null,
          name: "dialog",
          version: "1.0.0",
          ref: "@alice/dialog@1.0.0",
        },
        item: {
          type: "registry:block",
          registryDependencies: ["@alice/button"],
          files: [
            {
              path: "index.tsx",
              content:
                'import { Button } from "./Button";\nexport function Dialog() { return <Button />; }',
            },
          ],
        },
      },
    ]);

    expect(result.files["src/components/registry/alice/dialog/index.tsx"]).toContain(
      'from "../button/index"',
    );
    expect(result.files["src/components/registry/alice/dialog/index.tsx"]).not.toContain(
      'from "./Button"',
    );
  });

  it("preserves project-scoped registry paths when rewriting direct dependencies", () => {
    const result = materializeInstalledRegistryFilesFromResolvedGraph([
      {
        ref: {
          owner: "indeed-cozy",
          projectKey: "ds",
          name: "button",
          version: "0.1.0",
          ref: "@indeed-cozy/ds/button@0.1.0",
        },
        item: {
          type: "registry:ui",
          registryDependencies: [],
          files: [{ path: "index.tsx", content: "export function Button() { return <button />; }" }],
        },
      },
      {
        ref: {
          owner: "indeed-cozy",
          projectKey: "ds",
          name: "dialog",
          version: "0.1.0",
          ref: "@indeed-cozy/ds/dialog@0.1.0",
        },
        item: {
          type: "registry:ui",
          registryDependencies: ["@indeed-cozy/ds/button"],
          files: [
            {
              path: "Button.tsx",
              content: 'export * from "@indeed-cozy/ds/button";',
            },
            {
              path: "index.tsx",
              content:
                'import { Button } from "./Button";\nexport function Dialog() { return <Button />; }',
            },
          ],
        },
      },
    ]);

    expect(result.files["src/components/registry/indeed-cozy/ds/dialog/Button.tsx"]).toContain(
      'from "../button/index"',
    );
    expect(result.rootEntries["@indeed-cozy/ds/dialog@0.1.0"]).toBe(
      "src/components/registry/indeed-cozy/ds/dialog/index",
    );
  });
});
