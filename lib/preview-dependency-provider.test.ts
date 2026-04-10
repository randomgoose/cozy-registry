import fs from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateThirdPartyDependencies } from "@/lib/third-party-dependency-governance";
import {
  __previewDependencyProviderInternals,
  getPreviewDependencyHostNodePaths,
  resolvePreviewDependencies,
} from "@/lib/preview-dependency-provider";
import {
  buildCompatibleBundleCacheKey,
  buildCompatibleRemoteSourceUrl,
  buildCompatibleBundleMetadataPath,
} from "@/lib/preview-compatible-delivery";

const providerRootEnv = "COZY_PREVIEW_DEPENDENCY_PROVIDER_ROOT";
const compatibleBundleRootEnv = "COZY_PREVIEW_COMPATIBLE_BUNDLE_ROOT";
const originalProviderRoot = process.env[providerRootEnv];
const originalCompatibleBundleRoot = process.env[compatibleBundleRootEnv];

afterEach(() => {
  if (originalProviderRoot === undefined) {
    delete process.env[providerRootEnv];
  } else {
    process.env[providerRootEnv] = originalProviderRoot;
  }
  if (originalCompatibleBundleRoot === undefined) {
    delete process.env[compatibleBundleRootEnv];
  } else {
    process.env[compatibleBundleRootEnv] = originalCompatibleBundleRoot;
  }
});

describe("preview-dependency-provider", () => {
  it(
    "resolves an exact trusted built-in from the controlled provider after explicit prewarm",
    async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-seed-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["lucide-react"],
      declared: [{ name: "lucide-react", version: "0.577.0" }],
    });

    const appRequire = Module.createRequire(
      path.join(process.cwd(), "package.json"),
    );
    await __previewDependencyProviderInternals.seedProviderFromHost({
      appRequire,
      packageName: "lucide-react",
      requestedVersion: "0.577.0",
      providerRoot: tmpRoot,
      hostNodePaths: getPreviewDependencyHostNodePaths(appRequire),
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
    30000,
  );

  it("explicit prewarm copies transitive trusted built-in dependencies into the controlled provider cache", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-transitive-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const appRequire = Module.createRequire(
      path.join(process.cwd(), "package.json"),
    );
    await __previewDependencyProviderInternals.seedProviderFromHost({
      appRequire,
      packageName: "class-variance-authority",
      requestedVersion: "0.7.1",
      providerRoot: tmpRoot,
      hostNodePaths: getPreviewDependencyHostNodePaths(appRequire),
    });

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

  it("fails managed-package resolution when the requested version is not exact", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-range-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["lucide-react"],
      declared: [{ name: "lucide-react", version: "^0.577.0" }],
    });

    await expect(resolvePreviewDependencies({ decisions })).rejects.toThrow(
      'Unable to resolve managed preview dependency "lucide-react@^0.577.0" from the controlled provider.',
    );

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("fails exact managed-package resolution when provider cache misses", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-provider-no-host-test-"),
    );
    process.env[providerRootEnv] = tmpRoot;

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["lucide-react"],
      declared: [{ name: "lucide-react", version: "0.577.0" }],
    });

    await expect(
      resolvePreviewDependencies({ decisions }),
    ).rejects.toThrow(
      'Unable to resolve managed preview dependency "lucide-react@0.577.0" from the controlled provider.',
    );

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

    const appRequire = Module.createRequire(
      path.join(process.cwd(), "package.json"),
    );
    await __previewDependencyProviderInternals.seedProviderFromHost({
      appRequire,
      packageName: "@base-ui/react",
      requestedVersion: "1.3.0",
      providerRoot: tmpRoot,
      hostNodePaths: getPreviewDependencyHostNodePaths(appRequire),
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
      path.join(tmpRoot, "@base-ui__react", "1.3.0", "node_modules"),
    );

    await fs.rm(tmpRoot, { recursive: true, force: true });
    },
    30000,
  );

  it(
    "returns node_modules root for scoped compatible-external packages materialized from registry",
    async () => {
      const tmpRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "cozy-preview-provider-radix-test-"),
      );
      process.env[providerRootEnv] = tmpRoot;

      const decisions = evaluateThirdPartyDependencies({
        discovered: ["@radix-ui/react-dropdown-menu"],
        declared: [{ name: "@radix-ui/react-dropdown-menu", version: "2.1.15" }],
      });

      const result = await resolvePreviewDependencies({ decisions });

      expect(result.plan.compatibleExternals).toEqual([
        expect.objectContaining({
          packageName: "@radix-ui/react-dropdown-menu",
          requestedVersion: "2.1.15",
          importMapTarget: "@radix-ui/react-dropdown-menu",
          deliveryMode: "compatible-remote",
          publicUrl: null,
        }),
      ]);
      expect(result.nodePaths).toEqual([]);
      expect(result.plan.hostFallbackUsed).toBe(false);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  },
    30000,
  );

  it("records compatible-external dependencies in the provider plan without requiring package materialization", async () => {
    const decisions = evaluateThirdPartyDependencies({
      discovered: ["recharts"],
      declared: [{ name: "recharts", version: "2.15.3" }],
    });

    const result = await resolvePreviewDependencies({ decisions });

    expect(result.resolutions).toEqual([]);
    expect(result.plan.compatibleExternals).toEqual([
      expect.objectContaining({
        packageName: "recharts",
        requestedVersion: "2.15.3",
        importMapTarget: "recharts",
        deliveryMode: "compatible-remote",
        publicUrl: null,
      }),
    ]);
    expect(result.plan.managedPackages).toEqual([]);
    expect(result.plan.hostFallbackUsed).toBe(false);
    expect(result.nodePaths).toEqual([]);
  });

  it("prefers cached compatible-bundled metadata when present", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-preview-compatible-bundle-test-"),
    );
    process.env[compatibleBundleRootEnv] = tmpRoot;

    const sourceUrl = buildCompatibleRemoteSourceUrl({
      importMapTarget: "recharts",
      isDev: false,
    });
    const cacheKey = buildCompatibleBundleCacheKey({
      packageName: "recharts",
      version: "2.15.3",
      sourceUrl,
    });
    const metadataPath = buildCompatibleBundleMetadataPath({
      packageName: "recharts",
      version: "2.15.3",
      cacheKey,
      root: tmpRoot,
    });
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(
      metadataPath,
      JSON.stringify(
        {
          packageName: "recharts",
          requestedVersion: "2.15.3",
          importMapTarget: "recharts",
          deliveryMode: "compatible-bundled",
          sourceUrl,
          publicUrl: "https://preview-assets.example.com/compatible-bundles/recharts/2.15.3/bundle.mjs",
          cacheKey,
          contentHash: "sha256:test",
        },
        null,
        2,
      ),
      "utf8",
    );

    const decisions = evaluateThirdPartyDependencies({
      discovered: ["recharts"],
      declared: [{ name: "recharts", version: "2.15.3" }],
    });

    const result = await resolvePreviewDependencies({ decisions });

    expect(result.plan.compatibleExternals).toEqual([
      expect.objectContaining({
        packageName: "recharts",
        deliveryMode: "compatible-bundled",
        publicUrl:
          "https://preview-assets.example.com/compatible-bundles/recharts/2.15.3/bundle.mjs",
      }),
    ]);
    expect(result.plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: "recharts",
          code: "COMPATIBLE_BUNDLED_READY",
        }),
      ]),
    );
    expect(result.plan.hostFallbackUsed).toBe(false);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
