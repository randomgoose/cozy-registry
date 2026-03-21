type AssetScope =
  | { kind: "user"; id: string }
  | { kind: "project"; id: string }
  | { kind: "team"; id: string };

type UploadAssetParams = {
  path: string;
  body: BodyInit;
  contentType: string;
  cacheControl?: string;
};

const DEFAULT_BUCKET = "registry-thumbnails";

function getSupabaseStorageConfig() {
  const baseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    "";
  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ??
    DEFAULT_BUCKET;

  if (!baseUrl || !serviceRoleKey || !bucket) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    serviceRoleKey,
    bucket,
  };
}

export function isSupabaseStorageConfigured() {
  return !!getSupabaseStorageConfig();
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

export async function uploadPublicAsset(params: UploadAssetParams) {
  const config = getSupabaseStorageConfig();
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
    body: params.body,
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
