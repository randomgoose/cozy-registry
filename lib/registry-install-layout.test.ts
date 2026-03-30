import { describe, expect, it } from "vitest";
import { materializeInstalledRegistryFilesFromResolvedGraph } from "@/lib/registry-install-layout";

describe("registry install layout helpers", () => {
  it("materializes a flat installed file tree and rewrites root imports to sibling items", () => {
    const result = materializeInstalledRegistryFilesFromResolvedGraph([
      {
        ref: { owner: "alice", name: "button", version: "1.0.0", ref: "@alice/button@1.0.0" },
        item: {
          type: "registry:ui",
          registryDependencies: [],
          files: [{ path: "index.tsx", content: "export function Button() { return <button />; }" }],
        },
      },
      {
        ref: { owner: "alice", name: "dialog", version: "1.0.0", ref: "@alice/dialog@1.0.0" },
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
  });
});
