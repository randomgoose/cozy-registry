import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";
import path from "node:path";
import {
  buildCompatibleBundleMetadataPath,
  getPreviewCompatibleBundleRoot,
  readCompatibleBundleMetadata,
  type PreviewCompatibleBundleMetadata,
  type PreviewCompatibleExternalDelivery,
} from "@/lib/preview-compatible-delivery";
import { buildCompatibleBundleStoragePath, uploadPublicAsset } from "@/lib/storage";
import { sha256 } from "@/lib/preview-build-cache";

function encodeBundlePathSegment(value: string) {
  return value.replaceAll("/", "__");
}

function getCompatibleBundleDir(input: {
  packageName: string;
  version: string;
  cacheKey: string;
  root?: string;
}) {
  return path.join(
    input.root ?? getPreviewCompatibleBundleRoot(),
    encodeBundlePathSegment(input.packageName),
    input.version,
    encodeBundlePathSegment(input.cacheKey),
  );
}

export function isCompatibleBundlingEnabled() {
  return (
    process.env.COZY_ENABLE_COMPATIBLE_BUNDLING?.trim().toLowerCase() === "true"
  );
}

export async function materializeCompatibleBundle(input: {
  entry: PreviewCompatibleExternalDelivery;
  upload?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<PreviewCompatibleExternalDelivery> {
  if (
    input.entry.deliveryMode === "compatible-bundled" ||
    !input.entry.requestedVersion ||
    !input.entry.cacheKey
  ) {
    return input.entry;
  }

  const existing = readCompatibleBundleMetadata({
    packageName: input.entry.packageName,
    version: input.entry.requestedVersion,
    cacheKey: input.entry.cacheKey,
  });
  if (existing) {
    return existing;
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const sourceRes = await fetchImpl(input.entry.sourceUrl);
  if (!sourceRes.ok) {
    throw new Error(
      `Failed to fetch compatible bundle source (${sourceRes.status}): ${input.entry.sourceUrl}`,
    );
  }
  const sourceCode = await sourceRes.text();

  const result = await esbuild.build({
    stdin: {
      contents: sourceCode,
      sourcefile: `${encodeBundlePathSegment(input.entry.packageName)}.mjs`,
      loader: "js",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    sourcemap: false,
    write: false,
    logLevel: "silent",
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  });

  const bundle = result.outputFiles?.[0]?.text;
  if (!bundle) {
    throw new Error("esbuild produced no compatible bundle output");
  }

  const bundleHash = sha256(bundle);
  const bundleDir = getCompatibleBundleDir({
    packageName: input.entry.packageName,
    version: input.entry.requestedVersion,
    cacheKey: input.entry.cacheKey,
  });
  await fs.mkdir(bundleDir, { recursive: true });
  await fs.writeFile(path.join(bundleDir, "bundle.mjs"), bundle, "utf8");

  let publicUrl = `file://${path.join(bundleDir, "bundle.mjs")}`;
  if (input.upload) {
    const storagePath = buildCompatibleBundleStoragePath({
      packageName: input.entry.packageName,
      version: input.entry.requestedVersion,
      cacheKey: input.entry.cacheKey,
      filename: "bundle.mjs",
    });
    const uploadedBundle = await uploadPublicAsset({
      path: storagePath,
      body: bundle,
      contentType: "application/javascript; charset=utf-8",
      cacheControl: "31536000",
      assetType: "preview-artifact",
    });
    publicUrl = `${uploadedBundle.url}${uploadedBundle.url.includes("?") ? "&" : "?"}v=${bundleHash.replace(/^sha256:/, "").slice(0, 16)}`;
  }

  const metadata: PreviewCompatibleBundleMetadata = {
    packageName: input.entry.packageName,
    requestedVersion: input.entry.requestedVersion,
    importMapTarget: input.entry.importMapTarget,
    deliveryMode: "compatible-bundled",
    sourceUrl: input.entry.sourceUrl,
    publicUrl,
    cacheKey: input.entry.cacheKey,
    contentHash: bundleHash,
  };

  const metadataPath = buildCompatibleBundleMetadataPath({
    packageName: input.entry.packageName,
    version: input.entry.requestedVersion,
    cacheKey: input.entry.cacheKey,
  });
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  if (input.upload) {
    await uploadPublicAsset({
      path: buildCompatibleBundleStoragePath({
        packageName: input.entry.packageName,
        version: input.entry.requestedVersion,
        cacheKey: input.entry.cacheKey,
        filename: "metadata.json",
      }),
      body: JSON.stringify(metadata, null, 2),
      contentType: "application/json; charset=utf-8",
      cacheControl: "31536000",
      assetType: "preview-artifact",
    });
  }

  return metadata;
}

export async function maybeMaterializeCompatibleBundles(input: {
  entries: PreviewCompatibleExternalDelivery[];
  upload?: boolean;
  fetchImpl?: typeof fetch;
}) {
  if (!isCompatibleBundlingEnabled()) {
    return input.entries;
  }

  const results = await Promise.all(
    input.entries.map(async (entry) => {
      try {
        return await materializeCompatibleBundle({
          entry,
          upload: input.upload,
          fetchImpl: input.fetchImpl,
        });
      } catch {
        return entry;
      }
    }),
  );
  return results;
}
