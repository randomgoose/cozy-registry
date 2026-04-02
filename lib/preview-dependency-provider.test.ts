import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateThirdPartyDependencies } from "@/lib/third-party-dependency-governance";
import { resolvePreviewDependencies } from "@/lib/preview-dependency-provider";

const providerRootEnv = "COZY_PREVIEW_DEPENDENCY_PROVIDER_ROOT";
const originalProviderRoot = process.env[providerRootEnv];

afterEach(() => {
  if (originalProviderRoot === undefined) {
    delete process.env[providerRootEnv];
  } else {
    process.env[providerRootEnv] = originalProviderRoot;
  }
});

describe("preview-dependency-provider", () => {
  it("materializes an exact trusted built-in into the controlled provider cache", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-seed-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["lucide-react"],
      declared: [{ name: "lucide-react", version: "0.577.0" }],
    });

    const result = await resolvePreviewDependencies({ decisions });

    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]?.resolutionSource).toBe("provider");
    expect(result.diagnostics).toEqual([]);
    expect(result.nodePaths).toContain(path.join(tmpRoot, "lucide-react", "0.577.0", "node_modules"));
    await expect(
      fs.access(
        path.join(
          tmpRoot,
          "lucide-react",
          "0.577.0",
          "node_modules",
          "lucide-react",
          "package.json",
        ),
      ),
    ).resolves.toBeUndefined();

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("copies transitive trusted built-in dependencies into the controlled provider cache", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-transitive-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["class-variance-authority"],
      declared: [{ name: "class-variance-authority", version: "0.7.1" }],
    });

    const result = await resolvePreviewDependencies({ decisions });

    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]?.resolutionSource).toBe("provider");
    await expect(
      fs.access(
        path.join(
          tmpRoot,
          "class-variance-authority",
          "0.7.1",
          "node_modules",
          "class-variance-authority",
          "package.json",
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(
        path.join(
          tmpRoot,
          "class-variance-authority",
          "0.7.1",
          "node_modules",
          "clsx",
          "package.json",
        ),
      ),
    ).resolves.toBeUndefined();

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("prefers the controlled provider root when a trusted built-in is available there", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const providerPackageRoot = path.join(
      tmpRoot,
      "lucide-react",
      "0.577.0",
      "node_modules",
      "lucide-react",
    );
    await fs.mkdir(providerPackageRoot, { recursive: true });
    await fs.writeFile(
      path.join(providerPackageRoot, "package.json"),
      JSON.stringify({ name: "lucide-react", version: "0.577.0" }),
      "utf8",
    );

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["lucide-react"],
      declared: [{ name: "lucide-react", version: "0.577.0" }],
    });

    const result = await resolvePreviewDependencies({ decisions });

    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]?.resolutionSource).toBe("provider");
    expect(result.diagnostics).toEqual([]);
    expect(result.nodePaths).toContain(path.dirname(providerPackageRoot));

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("surfaces host fallback diagnostics when the requested version is not exact", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-range-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["lucide-react"],
      declared: [{ name: "lucide-react", version: "^0.577.0" }],
    });

    const result = await resolvePreviewDependencies({ decisions });

    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]?.resolutionSource).toBe("host-fallback");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        packageName: "lucide-react",
        resolutionSource: "host-fallback",
      }),
    ]);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
