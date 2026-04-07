import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  maybeMaterializeCompatibleBundles,
  materializeCompatibleBundle,
} from "@/lib/compatible-bundle-materializer";
import {
  buildCompatibleBundleMetadataPath,
  resolveCompatibleExternalDelivery,
} from "@/lib/preview-compatible-delivery";

const compatibleBundleRootEnv = "COZY_PREVIEW_COMPATIBLE_BUNDLE_ROOT";
const compatibleBundlingEnv = "COZY_ENABLE_COMPATIBLE_BUNDLING";
const originalCompatibleBundleRoot = process.env[compatibleBundleRootEnv];
const originalCompatibleBundling = process.env[compatibleBundlingEnv];

afterEach(() => {
  if (originalCompatibleBundleRoot === undefined) {
    delete process.env[compatibleBundleRootEnv];
  } else {
    process.env[compatibleBundleRootEnv] = originalCompatibleBundleRoot;
  }

  if (originalCompatibleBundling === undefined) {
    delete process.env[compatibleBundlingEnv];
  } else {
    process.env[compatibleBundlingEnv] = originalCompatibleBundling;
  }
});

describe("compatible-bundle-materializer", () => {
  it("returns entries unchanged when compatible bundling is disabled", async () => {
    delete process.env[compatibleBundlingEnv];

    const entry = resolveCompatibleExternalDelivery({
      packageName: "recharts",
      requestedVersion: "2.15.3",
      importMapTarget: "recharts",
      isDev: false,
    });

    const result = await maybeMaterializeCompatibleBundles({
      entries: [entry],
    });

    expect(result).toEqual([entry]);
  });

  it("reuses cached bundled metadata without fetching", async () => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-compatible-bundle-cache-test-"),
    );
    process.env[compatibleBundleRootEnv] = tmpRoot;
    process.env[compatibleBundlingEnv] = "true";

    const entry = resolveCompatibleExternalDelivery({
      packageName: "recharts",
      requestedVersion: "2.15.3",
      importMapTarget: "recharts",
      isDev: false,
    });
    if (!entry.cacheKey || !entry.requestedVersion) {
      throw new Error("Expected compatible entry to include cache metadata");
    }

    const metadataPath = buildCompatibleBundleMetadataPath({
      packageName: entry.packageName,
      version: entry.requestedVersion,
      cacheKey: entry.cacheKey,
      root: tmpRoot,
    });
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(
      metadataPath,
      JSON.stringify(
        {
          packageName: entry.packageName,
          requestedVersion: entry.requestedVersion,
          importMapTarget: entry.importMapTarget,
          deliveryMode: "compatible-bundled",
          sourceUrl: entry.sourceUrl,
          publicUrl:
            "https://preview-assets.example.com/compatible-bundles/recharts/2.15.3/bundle.mjs",
          cacheKey: entry.cacheKey,
          contentHash: "sha256:test",
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await materializeCompatibleBundle({
      entry,
      fetchImpl: (() => {
        throw new Error("fetch should not be called when cached metadata exists");
      }) as unknown as typeof fetch,
    });

    expect(result).toEqual(
      expect.objectContaining({
        deliveryMode: "compatible-bundled",
        publicUrl:
          "https://preview-assets.example.com/compatible-bundles/recharts/2.15.3/bundle.mjs",
      }),
    );

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
