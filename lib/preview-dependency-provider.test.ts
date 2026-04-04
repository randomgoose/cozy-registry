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
  it(
    "materializes an exact trusted built-in into the controlled provider cache",
    async () => {
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
    },
    15000,
  );

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
        code: "HOST_FALLBACK_USED",
        hostFallbackUsed: true,
      }),
    ]);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it(
    "resolves @base-ui subpath imports through the canonical root package",
    async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-base-ui-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["@base-ui/react/dialog"],
      declared: [{ name: "@base-ui/react", version: "1.3.0" }],
    });

    const result = await resolvePreviewDependencies({ decisions });

    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]).toMatchObject({
      packageName: "@base-ui/react",
      requestedVersion: "1.3.0",
      resolutionSource: "provider",
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.nodePaths).toContain(
      path.join(tmpRoot, "@base-ui__react", "1.3.0", "node_modules", "@base-ui"),
    );

    await fs.rm(tmpRoot, { recursive: true, force: true });
    },
    15000,
  );

  it("records compatible-external dependencies in the provider plan without requiring package materialization", async () => {
    const decisions = evaluateThirdPartyDependencies({
      discovered: ["recharts"],
      declared: [{ name: "recharts", version: "2.15.3" }],
    });

    const result = await resolvePreviewDependencies({ decisions });

    expect(result.resolutions).toEqual([]);
    expect(result.plan.compatibleExternals).toEqual([
      {
        packageName: "recharts",
        requestedVersion: "2.15.3",
        importMapTarget: "recharts",
      },
    ]);
    expect(result.plan.managedPackages).toEqual([]);
  });
});
