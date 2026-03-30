import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGACY_REGISTRY_INSTALL_ROOT,
  migrateInstalledFilePath,
  migrateProjectRegistryLayout,
  rewriteLegacyDepsImports,
} from "@/lib/migrate-registry-layout";
import { REGISTRY_INSTALL_ROOT } from "@/lib/registry-install-layout";
import { readLockfile } from "@/lib/install-protocol";

const tempRoots: string[] = [];

async function makeProjectRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cozy-migrate-test-"));
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

describe("migrateInstalledFilePath", () => {
  it("maps root package files", () => {
    expect(migrateInstalledFilePath("src/registry/acme/dialog/index.tsx")).toBe(
      `${REGISTRY_INSTALL_ROOT}/acme/dialog/index.tsx`,
    );
  });

  it("hoists _deps paths to sibling packages", () => {
    expect(
      migrateInstalledFilePath(
        "src/registry/acme/dialog/_deps/acme/button/registry/modules/button.tsx",
      ),
    ).toBe(`${REGISTRY_INSTALL_ROOT}/acme/button/registry/modules/button.tsx`);
  });
});

describe("rewriteLegacyDepsImports", () => {
  it("rewrites _deps specifiers using new importer layout", () => {
    const content =
      'import { Button } from "./_deps/acme/button/index";\nexport function Dialog() { return null; }\n';
    const next = rewriteLegacyDepsImports(
      content,
      `${REGISTRY_INSTALL_ROOT}/acme/dialog/index.tsx`,
    );
    expect(next).toContain('from "../button/index"');
    expect(next).not.toContain("_deps");
  });
});

describe("migrateProjectRegistryLayout integration", () => {
  it("copies, rewrites imports, migrates lockfile, and removes legacy tree", async () => {
    const projectRoot = await makeProjectRoot();

    await fs.mkdir(
      path.join(projectRoot, LEGACY_REGISTRY_INSTALL_ROOT, "acme", "button"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        projectRoot,
        LEGACY_REGISTRY_INSTALL_ROOT,
        "acme",
        "button",
        "index.tsx",
      ),
      "export function Button() { return <button />; }\n",
      "utf8",
    );

    await fs.mkdir(
      path.join(
        projectRoot,
        LEGACY_REGISTRY_INSTALL_ROOT,
        "acme",
        "dialog",
        "_deps",
        "acme",
        "button",
      ),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        projectRoot,
        LEGACY_REGISTRY_INSTALL_ROOT,
        "acme",
        "dialog",
        "_deps",
        "acme",
        "button",
        "index.tsx",
      ),
      "export function Button() { return <button />; }\n",
      "utf8",
    );

    await fs.writeFile(
      path.join(
        projectRoot,
        LEGACY_REGISTRY_INSTALL_ROOT,
        "acme",
        "dialog",
        "index.tsx",
      ),
      'import { Button } from "./_deps/acme/button/index";\nexport function Dialog() { return <Button />; }\n',
      "utf8",
    );

    await fs.writeFile(
      path.join(projectRoot, "cozy-registry.lock.json"),
      `${JSON.stringify(
        {
          version: 1,
          items: {
            "@acme/dialog": {
              type: "registry:block",
              version: "1.0.0",
              source: "https://example.com/r",
              installedFiles: [
                "src/registry/acme/dialog/index.tsx",
                "src/registry/acme/dialog/_deps/acme/button/index.tsx",
              ],
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const report = await migrateProjectRegistryLayout(projectRoot, {});

    expect(report.removedOldRoot).toBe(true);
    expect(
      await fs.access(path.join(projectRoot, LEGACY_REGISTRY_INSTALL_ROOT)).then(
        () => false,
        () => true,
      ),
    ).toBe(true);

    const dialogSrc = await fs.readFile(
      path.join(projectRoot, REGISTRY_INSTALL_ROOT, "acme", "dialog", "index.tsx"),
      "utf8",
    );
    expect(dialogSrc).toContain('from "../button/index"');
    expect(dialogSrc).not.toContain("_deps");

    const lock = await readLockfile(projectRoot);
    expect(lock.items["@acme/dialog"]?.installedFiles).toEqual([
      `${REGISTRY_INSTALL_ROOT}/acme/dialog/index.tsx`,
      `${REGISTRY_INSTALL_ROOT}/acme/button/index.tsx`,
    ]);

    expect(report.rewrittenSourceFiles.length).toBeGreaterThanOrEqual(1);
  });
});
