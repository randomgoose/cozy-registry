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
  it("strips legacy registry/modules prefixes from installed file paths", async () => {
    const projectRoot = await makeProjectRoot();

    await installRegistryBundle({
      projectRoot,
      coordinate: "@alice/kpi-card",
      type: "registry:block",
      version: "1.0.0",
      source: "https://registry.example.com/api/r/alice/kpi-card?v=1.0.0",
      files: [
        {
          path: "registry/modules/index.tsx",
          content: "export default function KpiCard() { return <section />; }",
          type: "registry:block",
        },
      ],
      registryDependencies: [],
      registryBaseUrl: "https://registry.example.com",
      fetchImpl: async () => {
        throw new Error("Unexpected fetch");
      },
    });

    const expectedPath = path.join(
      projectRoot,
      getDefaultInstallDir({ owner: "alice", name: "kpi-card" }),
      "index.tsx",
    );
    const legacyPath = path.join(
      projectRoot,
      getDefaultInstallDir({ owner: "alice", name: "kpi-card" }),
      "registry/modules/index.tsx",
    );

    await expect(fs.readFile(expectedPath, "utf8")).resolves.toContain("KpiCard");
    await expect(fs.readFile(legacyPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const lockfile = await readLockfile(projectRoot);
    expect(lockfile.items["@alice/kpi-card"]?.installedFiles).toEqual([
      "src/components/registry/alice/kpi-card/index.tsx",
    ]);
  });

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

  it("installs project-scoped coordinates under owner/project/name", async () => {
    const projectRoot = await makeProjectRoot();

    await installRegistryBundle({
      projectRoot,
      coordinate: "@alice/dashboard-neo/kpi-card",
      type: "registry:block",
      version: "1.0.0",
      source: "https://registry.example.com/api/r/alice/kpi-card?v=1.0.0&project=dashboard-neo",
      files: [
        {
          path: "index.tsx",
          content: "export default function KpiCard() { return <div />; }",
          type: "registry:block",
        },
      ],
      registryDependencies: [],
      registryBaseUrl: "https://registry.example.com",
      fetchImpl: async () => {
        throw new Error("Unexpected fetch");
      },
    });

    const scopedPath = path.join(
      projectRoot,
      getDefaultInstallDir({ owner: "alice", projectSlug: "dashboard-neo", name: "kpi-card" }),
      "index.tsx",
    );
    await expect(fs.readFile(scopedPath, "utf8")).resolves.toContain("KpiCard");

    const lockfile = await readLockfile(projectRoot);
    expect(lockfile.items["@alice/dashboard-neo/kpi-card"]?.installedFiles).toEqual([
      "src/components/registry/alice/dashboard-neo/kpi-card/index.tsx",
    ]);
  });
});
