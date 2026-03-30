import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installRegistryBundle,
  readLockfile,
} from "@/lib/install-protocol";
import { getDefaultInstallDir } from "@/lib/registry-install-layout";

const tempRoots: string[] = [];

async function makeProjectRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cozy-install-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("install protocol v1 layout", () => {
  it("installs registry dependencies as flat sibling items and rewrites explicit registry refs", async () => {
    const projectRoot = await makeProjectRoot();
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/registry/alice/button/versions")) {
        return Response.json({ currentVersion: "1.2.0" });
      }
      if (url.includes("/api/r/alice/button?v=1.2.0")) {
        return Response.json({
          name: "button",
          type: "registry:ui",
          files: [
            {
              path: "index.tsx",
              content: "export function Button() { return <button />; }",
              type: "registry:ui",
            },
          ],
          registryDependencies: [],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    await installRegistryBundle({
      projectRoot,
      coordinate: "@alice/dialog",
      type: "registry:block",
      version: "1.0.0",
      source: "https://registry.example.com/api/r/alice/dialog?v=1.0.0",
      files: [
        {
          path: "index.tsx",
          content:
            'import { Button } from "@alice/button";\nexport function Dialog() { return <Button />; }',
          type: "registry:block",
        },
      ],
      registryDependencies: ["@alice/button"],
      registryBaseUrl: "https://registry.example.com",
      fetchImpl,
    });

    const dialogPath = path.join(
      projectRoot,
      getDefaultInstallDir({ owner: "alice", name: "dialog" }),
      "index.tsx",
    );
    const buttonPath = path.join(
      projectRoot,
      getDefaultInstallDir({ owner: "alice", name: "button" }),
      "index.tsx",
    );

    const dialogSource = await fs.readFile(dialogPath, "utf8");
    expect(dialogSource).toContain('from "../button/index"');
    await expect(fs.readFile(buttonPath, "utf8")).resolves.toContain("Button");

    const lockfile = await readLockfile(projectRoot);
    expect(lockfile.items["@alice/dialog"]?.installedFiles).toEqual([
      "src/components/registry/alice/dialog/index.tsx",
    ]);
    expect(lockfile.items["@alice/button"]?.installedFiles).toEqual([
      "src/components/registry/alice/button/index.tsx",
    ]);
  });

  it("rewrites missing relative imports to direct registry dependencies by name", async () => {
    const projectRoot = await makeProjectRoot();
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/registry/alice/button/versions")) {
        return Response.json({ currentVersion: "2.0.0" });
      }
      if (url.includes("/api/r/alice/button?v=2.0.0")) {
        return Response.json({
          name: "button",
          type: "registry:ui",
          files: [
            {
              path: "index.tsx",
              content: "export function Button() { return <button />; }",
              type: "registry:ui",
            },
          ],
          registryDependencies: [],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    await installRegistryBundle({
      projectRoot,
      coordinate: "@alice/dialog",
      type: "registry:block",
      version: "1.0.0",
      source: "https://registry.example.com/api/r/alice/dialog?v=1.0.0",
      files: [
        {
          path: "index.tsx",
          content:
            'import { Button } from "./Button";\nexport function Dialog() { return <Button />; }',
          type: "registry:block",
        },
      ],
      registryDependencies: ["@alice/button"],
      registryBaseUrl: "https://registry.example.com",
      fetchImpl,
    });

    const dialogPath = path.join(
      projectRoot,
      getDefaultInstallDir({ owner: "alice", name: "dialog" }),
      "index.tsx",
    );
    const dialogSource = await fs.readFile(dialogPath, "utf8");
    expect(dialogSource).toContain('from "../button/index"');
    expect(dialogSource).not.toContain('from "./Button"');
  });
});
