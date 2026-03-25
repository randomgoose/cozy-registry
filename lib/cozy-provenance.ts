import { createHash } from "crypto";

export type CozyContentHashSha256 = `sha256:${string}`;

export type CozyProvenanceFileRoot = { path: string; source: "root" };
export type CozyProvenanceFileGenerated = { path: string; source: "generated" };
export type CozyProvenanceFileRegistry = {
  path: string;
  source: "registry";
  /**
   * Dependency ref used to fetch the expanded dependency bundle.
   * Recommended pinned form: `@owner/name@version`.
   */
  ref: string;
  /**
   * Path within the dependency bundle at expansion time.
   * Optional to allow AI-generated/partial manifests during publish.
   */
  originalPath?: string;
  /**
   * Optional hash of the expanded dependency file at expansion time.
   * When missing/unknown, strict mode should skip dirty detection.
   */
  contentHash?: string;
};

export type CozyProvenanceFile =
  | CozyProvenanceFileRoot
  | CozyProvenanceFileGenerated
  | CozyProvenanceFileRegistry;

export type CozyProvenanceManifestV1 = {
  schemaVersion: 1;
  root: { ref: string; version?: string };
  files: CozyProvenanceFile[];
};

export function sha256Utf8(content: string): CozyContentHashSha256 {
  const hex = createHash("sha256").update(content, "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function isPlaceholderContentHash(v: unknown): boolean {
  if (typeof v !== "string") return true;
  const s = v.trim();
  if (!s) return true;
  return (
    s === "unknown" ||
    s === "sha256:unknown" ||
    s === "sha256:UNKNOWN" ||
    s === "sha256:Unknown"
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function isProvenanceFileRoot(v: unknown): v is CozyProvenanceFileRoot {
  return isRecord(v) && v["source"] === "root" && typeof v["path"] === "string";
}

export function isProvenanceFileRegistry(
  v: unknown,
): v is CozyProvenanceFileRegistry {
  return (
    isRecord(v) &&
    v["source"] === "registry" &&
    typeof v["path"] === "string" &&
    typeof v["ref"] === "string" &&
    (v["originalPath"] === undefined || typeof v["originalPath"] === "string") &&
    (v["contentHash"] === undefined || typeof v["contentHash"] === "string")
  );
}

/**
 * Normalize AI-friendly provenance `files` formats.
 *
 * Supported:
 * - Array form: [{ path, source, ... }, ...]
 * - Object-map form: { "path.tsx": { source, ... }, ... }
 *   - If meta is non-object, we treat it as `{ source: "root" }`.
 */
export function normalizeProvenanceFiles(input: unknown): unknown[] {
  if (Array.isArray(input)) return input as unknown[];
  if (isRecord(input)) {
    const out: unknown[] = [];
    for (const [filePath, meta] of Object.entries(input)) {
      if (!filePath || typeof filePath !== "string") continue;
      if (!isRecord(meta)) {
        out.push({ path: filePath, source: "root" });
        continue;
      }
      out.push({ path: filePath, ...meta });
    }
    return out;
  }
  return [];
}

