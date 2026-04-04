import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type AssetScope =
  | { kind: "user"; id: string }
  | { kind: "project"; id: string }
  | { kind: "team"; id: string };

type UploadAssetParams = {
  path: string;
  body: string | Uint8Array;
  contentType: string;
  cacheControl?: string;
  assetType?: "thumbnail" | "preview-artifact";
};

const DEFAULT_BUCKET = "registry-thumbnails";
const DEFAULT_STORAGE_PROVIDER = "supabase";

function resolveBucketByAssetType(
  assetType: UploadAssetParams["assetType"],
  input: {
    defaultBucket: string;
    thumbnailBucket?: string | undefined;
    previewArtifactBucket?: string | undefined;
  },
) {
  if (assetType === "preview-artifact") {
    return (
      input.previewArtifactBucket ??
      input.thumbnailBucket ??
      input.defaultBucket
    );
  }
  return input.thumbnailBucket ?? input.defaultBucket;
}

function getSupabaseStorageConfig(assetType: UploadAssetParams["assetType"]) {
  const baseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    "";
  const bucket = resolveBucketByAssetType(assetType, {
    defaultBucket:
      process.env.SUPABASE_STORAGE_BUCKET ??
      process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ??
      DEFAULT_BUCKET,
    thumbnailBucket:
      process.env.SUPABASE_THUMBNAIL_BUCKET ??
      process.env.NEXT_PUBLIC_SUPABASE_THUMBNAIL_BUCKET,
    previewArtifactBucket:
      process.env.SUPABASE_PREVIEW_ARTIFACT_BUCKET ??
      process.env.NEXT_PUBLIC_SUPABASE_PREVIEW_ARTIFACT_BUCKET,
  });

  if (!baseUrl || !serviceRoleKey || !bucket) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    serviceRoleKey,
    bucket,
  };
}

function getS3StorageConfig(assetType: UploadAssetParams["assetType"]) {
  const bucket = resolveBucketByAssetType(assetType, {
    defaultBucket: process.env.S3_BUCKET ?? process.env.R2_BUCKET ?? "",
    thumbnailBucket:
      process.env.S3_THUMBNAIL_BUCKET ?? process.env.R2_THUMBNAIL_BUCKET,
    previewArtifactBucket:
      process.env.S3_PREVIEW_ARTIFACT_BUCKET ??
      process.env.R2_PREVIEW_ARTIFACT_BUCKET,
  });
  const region = process.env.S3_REGION ?? "auto";
  const endpoint = process.env.S3_ENDPOINT ?? process.env.R2_ENDPOINT ?? "";
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY ?? "";
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? "false").toLowerCase() === "true";
  const publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region,
    endpoint: endpoint || undefined,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    publicBaseUrl: publicBaseUrl || undefined,
  };
}

export function isSupabaseStorageConfigured() {
  return !!getSupabaseStorageConfig("thumbnail");
}

type PublicStorageProvider = {
  uploadPublicAsset: (params: UploadAssetParams) => Promise<{
    path: string;
    url: string;
    bucket: string;
  }>;
};

function getObjectStorageProvider() {
  return (process.env.OBJECT_STORAGE_PROVIDER ?? DEFAULT_STORAGE_PROVIDER)
    .trim()
    .toLowerCase();
}

function getPublicStorageProvider(): PublicStorageProvider {
  const provider = getObjectStorageProvider();
  if (provider === "supabase") {
    return {
      uploadPublicAsset: uploadPublicAssetViaSupabase,
    };
  }
  if (provider === "s3" || provider === "r2") {
    return {
      uploadPublicAsset: uploadPublicAssetViaS3Compatible,
    };
  }
  throw new Error(
    `Unsupported OBJECT_STORAGE_PROVIDER=${provider}. Supported: supabase (implemented), s3/r2 (reserved).`,
  );
}

export function buildRegistryAssetPath(params: {
  scope: AssetScope;
  ownerId: string;
  itemName: string;
  version: string;
  variant: "card";
  extension: "svg" | "png" | "webp";
}) {
  const scopePrefix =
    params.scope.kind === "user"
      ? "users"
      : params.scope.kind === "project"
        ? "projects"
        : "teams";

  return [
    scopePrefix,
    params.scope.id,
    "registry-items",
    params.ownerId,
    params.itemName,
    "versions",
    params.version,
    "thumbnails",
    `${params.variant}.${params.extension}`,
  ]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildRegistryPreviewArtifactPath(params: {
  owner: string;
  project?: string | null;
  itemName: string;
  version: string;
  mode: "default" | "thumbnail";
  artifactKey: string;
  filename: "preview.js" | "preview.css" | "manifest.json" | "preview.html";
}) {
  return [
    "registry-preview-artifacts",
    params.owner,
    params.project?.trim() || "_",
    params.itemName,
    "versions",
    params.version,
    params.mode,
    params.artifactKey,
    params.filename,
  ]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function uploadPublicAsset(params: UploadAssetParams) {
  const provider = getPublicStorageProvider();
  return provider.uploadPublicAsset(params);
}

async function uploadPublicAssetViaSupabase(params: UploadAssetParams) {
  const config = getSupabaseStorageConfig(params.assetType);
  if (!config) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.",
    );
  }

  const objectUrl = `${config.baseUrl}/storage/v1/object/${config.bucket}/${params.path}`;
  const res = await fetch(objectUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "Content-Type": params.contentType,
      "x-upsert": "true",
      "cache-control": params.cacheControl ?? "3600",
    },
    body: params.body as unknown as BodyInit,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(
      `Failed to upload asset to Supabase Storage (${res.status}): ${message || "unknown error"}`,
    );
  }

  return {
    path: params.path,
    url: `${config.baseUrl}/storage/v1/object/public/${config.bucket}/${params.path}`,
    bucket: config.bucket,
  };
}

async function uploadPublicAssetViaS3Compatible(params: UploadAssetParams) {
  const config = getS3StorageConfig(params.assetType);
  if (!config) {
    throw new Error(
      "S3/R2 storage is not configured. Set S3_BUCKET (or R2_BUCKET), S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY (or R2_*), and optionally S3_ENDPOINT/S3_PUBLIC_BASE_URL.",
    );
  }

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: params.path,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: `public, max-age=${params.cacheControl ?? "3600"}`,
    }),
  );

  const fallbackPublicUrl = config.endpoint
    ? `${config.endpoint.replace(/\/+$/, "")}/${config.bucket}/${params.path}`
    : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${params.path}`;
  const url = config.publicBaseUrl
    ? `${config.publicBaseUrl}/${params.path}`
    : fallbackPublicUrl;

  return {
    path: params.path,
    url,
    bucket: config.bucket,
  };
}
