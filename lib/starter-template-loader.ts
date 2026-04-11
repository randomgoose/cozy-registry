import fs from "node:fs/promises";
import path from "node:path";

import {
  type StarterTemplateDependencyRecord,
  type StarterTemplateFileRecord,
  type StarterTemplateManifest,
  getStarterTemplateDir,
  getStarterTemplateManifestPath,
  normalizeStarterTemplateResourceType,
  STARTER_TEMPLATE_SCHEMA_VERSION,
  STARTER_TEMPLATES_DIR,
} from "@/lib/starter-template-format";
import { normalizePreviewStoriesInput } from "@/lib/preview-stories";
import { normalizeThirdPartyDependenciesInput } from "@/lib/third-party-dependency-input";

type LoadedStarterTemplate = {
  manifest: StarterTemplateManifest;
  bundleFiles: Record<string, string>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStarterTemplateManifest(
  value: unknown,
  expectedTemplateKey: string,
): StarterTemplateManifest {
  if (!isObject(value)) {
    throw new Error(`Invalid starter template manifest for ${expectedTemplateKey}`);
  }

  const files = Array.isArray(value.files) ? value.files : null;
  if (
    typeof value.schemaVersion !== "number" ||
    typeof value.templateKey !== "string" ||
    typeof value.resourceType !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.entryFile !== "string" ||
    !files
  ) {
    throw new Error(`Starter template manifest is missing required fields: ${expectedTemplateKey}`);
  }

  const normalizedFiles: StarterTemplateFileRecord[] = files.map((file) => {
    if (!isObject(file) || typeof file.path !== "string" || typeof file.kind !== "string") {
      throw new Error(`Starter template file entry is invalid: ${expectedTemplateKey}`);
    }
    return {
      path: file.path,
      kind: file.kind as StarterTemplateFileRecord["kind"],
    };
  });

  const templateDependenciesRaw = Array.isArray(value.templateDependencies)
    ? value.templateDependencies
    : [];
  const templateDependencies: StarterTemplateDependencyRecord[] = templateDependenciesRaw.map(
    (dependency) => {
      if (
        !isObject(dependency) ||
        typeof dependency.templateKey !== "string" ||
        typeof dependency.localStubPath !== "string"
      ) {
        throw new Error(`Starter template dependency entry is invalid: ${expectedTemplateKey}`);
      }

      return {
        templateKey: dependency.templateKey,
        localStubPath: dependency.localStubPath,
      };
    },
  );

  const normalizedDeclaredDependencies = normalizeThirdPartyDependenciesInput(
    value.declaredDependencies,
  );
  if (normalizedDeclaredDependencies.error) {
    throw new Error(
      `Starter template declaredDependencies entry is invalid: ${expectedTemplateKey} (${normalizedDeclaredDependencies.error})`,
    );
  }

  const previewStories = normalizePreviewStoriesInput(value.previewStories);
  const previewDefaultStoryId =
    typeof value.previewDefaultStoryId === "string" &&
    value.previewDefaultStoryId.trim().length > 0
      ? value.previewDefaultStoryId.trim()
      : null;
  const previewExport =
    typeof value.previewExport === "string" && value.previewExport.trim().length > 0
      ? value.previewExport.trim()
      : null;

  return {
    schemaVersion: STARTER_TEMPLATE_SCHEMA_VERSION,
    templateKey: value.templateKey,
    resourceType: normalizeStarterTemplateResourceType(value.resourceType),
    title: value.title,
    description: value.description,
    entryFile: value.entryFile,
    files: normalizedFiles,
    templateDependencies,
    declaredDependencies: normalizedDeclaredDependencies.value,
    previewProps: value.previewProps,
    previewExport,
    previewStories,
    previewDefaultStoryId,
  };
}

function toBundlePath(templateFilePath: string): string | null {
  if (!templateFilePath.startsWith("files/")) return null;
  return templateFilePath.slice("files/".length);
}

export async function loadStarterTemplate(templateKey: string): Promise<LoadedStarterTemplate> {
  const templateDir = getStarterTemplateDir(templateKey);
  const manifestPath = getStarterTemplateManifestPath(templateKey);

  const manifestRaw = await fs.readFile(manifestPath, "utf8").catch(() => null);
  if (!manifestRaw) {
    throw new Error(
      `Starter template manifest not found for ${templateKey} under ${STARTER_TEMPLATES_DIR}`,
    );
  }

  const manifest = assertStarterTemplateManifest(JSON.parse(manifestRaw), templateKey);
  if (manifest.templateKey !== templateKey) {
    throw new Error(
      `Starter template manifest key mismatch: expected ${templateKey}, got ${manifest.templateKey}`,
    );
  }

  const bundleFiles = Object.fromEntries(
    await Promise.all(
      manifest.files
        .map((file) => ({ file, bundlePath: toBundlePath(file.path) }))
        .filter(
          (entry): entry is { file: StarterTemplateFileRecord; bundlePath: string } =>
            Boolean(entry.bundlePath),
        )
        .map(async ({ file, bundlePath }) => {
          const filePath = path.join(templateDir, file.path);
          const contents = await fs.readFile(filePath, "utf8").catch(() => null);
          if (contents == null) {
            throw new Error(`Starter template file not found: ${templateKey}/${file.path}`);
          }
          return [bundlePath, contents] as const;
        }),
    ),
  );

  if (Object.keys(bundleFiles).length === 0) {
    throw new Error(`Starter template ${templateKey} does not contain any bundle files`);
  }

  return { manifest, bundleFiles };
}
