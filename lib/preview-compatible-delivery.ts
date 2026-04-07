import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256, stableStringify } from "@/lib/preview-build-cache";

export const PREVIEW_COMPATIBLE_DELIVERY_MODES = [
  "compatible-remote",
  "compatible-bundled",
] as const;

export type PreviewCompatibleDeliveryMode =
  (typeof PREVIEW_COMPATIBLE_DELIVERY_MODES)[number];

export type PreviewCompatibleExternalDelivery = {
  packageName: string;
  requestedVersion: string | null;
  importMapTarget: string;
  deliveryMode: PreviewCompatibleDeliveryMode;
  sourceUrl: string;
  publicUrl: string | null;
  cacheKey: string | null;
  contentHash: string | null;
};

export type PreviewCompatibleBundleMetadata = {
  packageName: string;
  requestedVersion: string;
  importMapTarget: string;
  deliveryMode: "compatible-bundled";
  sourceUrl: string;
  publicUrl: string;
  cacheKey: string;
  contentHash: string | null;
};

type ReactExternalPolicy = "react-peer";

const DEFAULT_COMPATIBLE_BUNDLE_ROOT = path.join(
  os.tmpdir(),
  "cozy-preview-compatible-bundles",
);

function encodeCompatibleBundlePathSegment(value: string) {
  return value.replaceAll("/", "__");
}

export function getPreviewCompatibleBundleRoot() {
  const configured = process.env.COZY_PREVIEW_COMPATIBLE_BUNDLE_ROOT?.trim();
  return configured ? path.resolve(configured) : DEFAULT_COMPATIBLE_BUNDLE_ROOT;
}

export function buildCompatibleBundleMetadataPath(input: {
  packageName: string;
  version: string;
  cacheKey: string;
  root?: string;
}) {
  return path.join(
    input.root ?? getPreviewCompatibleBundleRoot(),
    encodeCompatibleBundlePathSegment(input.packageName),
    input.version,
    encodeCompatibleBundlePathSegment(input.cacheKey),
    "metadata.json",
  );
}

export function readCompatibleBundleMetadata(input: {
  packageName: string;
  version: string;
  cacheKey: string;
  root?: string;
}): PreviewCompatibleBundleMetadata | null {
  const metadataPath = buildCompatibleBundleMetadataPath(input);
  try {
    const raw = fs.readFileSync(metadataPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PreviewCompatibleBundleMetadata>;
    if (
      parsed.deliveryMode !== "compatible-bundled" ||
      typeof parsed.publicUrl !== "string" ||
      typeof parsed.sourceUrl !== "string" ||
      typeof parsed.cacheKey !== "string" ||
      typeof parsed.packageName !== "string" ||
      typeof parsed.requestedVersion !== "string" ||
      typeof parsed.importMapTarget !== "string"
    ) {
      return null;
    }
    return {
      packageName: parsed.packageName,
      requestedVersion: parsed.requestedVersion,
      importMapTarget: parsed.importMapTarget,
      deliveryMode: "compatible-bundled",
      sourceUrl: parsed.sourceUrl,
      publicUrl: parsed.publicUrl,
      cacheKey: parsed.cacheKey,
      contentHash:
        typeof parsed.contentHash === "string" ? parsed.contentHash : null,
    };
  } catch {
    return null;
  }
}

export function buildCompatibleRemoteSourceUrl(input: {
  importMapTarget: string;
  isDev: boolean;
  reactExternalPolicy?: ReactExternalPolicy;
}) {
  const reactExternalQuery =
    input.reactExternalPolicy === "react-peer" || !input.reactExternalPolicy
      ? "external=react,react-dom,react-dom/client"
      : "";
  const base = `https://esm.sh/${input.importMapTarget}`;
  const params = [
    input.isDev ? "dev" : null,
    reactExternalQuery,
    "bundle",
  ].filter(Boolean);
  return `${base}?${params.join("&")}`;
}

export function buildCompatibleBundleCacheKey(input: {
  packageName: string;
  version: string;
  sourceUrl: string;
  bundlerMode?: string;
  reactExternalPolicy?: ReactExternalPolicy;
}) {
  const contentHash = sha256(
    stableStringify({
      packageName: input.packageName,
      version: input.version,
      sourceUrl: input.sourceUrl,
      bundlerMode: input.bundlerMode ?? "esm-single-file",
      reactExternalPolicy: input.reactExternalPolicy ?? "react-peer",
    }),
  );
  return `compatible-bundle:${input.packageName}:${input.version}:${contentHash.replace(/^sha256:/, "")}:${input.reactExternalPolicy ?? "react-peer"}`;
}

export function resolveCompatibleExternalDelivery(input: {
  packageName: string;
  requestedVersion: string | null;
  importMapTarget: string;
  isDev: boolean;
  reactExternalPolicy?: ReactExternalPolicy;
}) : PreviewCompatibleExternalDelivery {
  const sourceUrl = buildCompatibleRemoteSourceUrl({
    importMapTarget: input.importMapTarget,
    isDev: input.isDev,
    reactExternalPolicy: input.reactExternalPolicy,
  });

  const version = input.requestedVersion?.trim() ?? "";
  const cacheKey = version
    ? buildCompatibleBundleCacheKey({
        packageName: input.packageName,
        version,
        sourceUrl,
        reactExternalPolicy: input.reactExternalPolicy,
      })
    : null;

  if (version && cacheKey) {
    const bundled = readCompatibleBundleMetadata({
      packageName: input.packageName,
      version,
      cacheKey,
    });
    if (bundled) {
      return bundled;
    }
  }

  return {
    packageName: input.packageName,
    requestedVersion: input.requestedVersion,
    importMapTarget: input.importMapTarget,
    deliveryMode: "compatible-remote",
    sourceUrl,
    publicUrl: null,
    cacheKey,
    contentHash: null,
  };
}

export function getCompatibleExternalImportUrl(
  entry: Pick<
    PreviewCompatibleExternalDelivery,
    "deliveryMode" | "publicUrl" | "sourceUrl"
  >,
) {
  if (entry.deliveryMode === "compatible-bundled" && entry.publicUrl) {
    return entry.publicUrl;
  }
  return entry.publicUrl ?? entry.sourceUrl;
}
