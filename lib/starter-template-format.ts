import path from "node:path";

import type { PreviewStory } from "@/lib/preview-stories";
import type { DeclaredThirdPartyDependency } from "@/lib/third-party-dependency-input";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";

export const STARTER_TEMPLATE_SCHEMA_VERSION = 1 as const;
export const STARTER_TEMPLATES_DIR = "starter-templates" as const;

export type StarterTemplateKind = "entry" | "supporting" | "style" | "docs" | "data";

export type StarterTemplateFileRecord = {
  path: string;
  kind: StarterTemplateKind;
};

export type StarterTemplateDependencyRecord = {
  templateKey: string;
  localStubPath: string;
};

export type StarterTemplateManifest = {
  schemaVersion: typeof STARTER_TEMPLATE_SCHEMA_VERSION;
  templateKey: string;
  resourceType: string;
  title: string;
  description: string;
  entryFile: string;
  files: StarterTemplateFileRecord[];
  templateDependencies: StarterTemplateDependencyRecord[];
  declaredDependencies: DeclaredThirdPartyDependency[];
  previewProps?: unknown;
  previewExport?: string | null;
  previewStories: PreviewStory[];
  previewDefaultStoryId?: string | null;
};

export function normalizeStarterTemplateResourceType(resourceType: string): string {
  return normalizeRegistryItemType(resourceType);
}

export function validateStarterTemplateKey(templateKey: string): {
  ok: true;
  segments: string[];
} | {
  ok: false;
  error: string;
} {
  const trimmed = templateKey.trim();
  if (!trimmed) {
    return { ok: false, error: "templateKey is required" };
  }

  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length < 2) {
    return {
      ok: false,
      error: "templateKey must include at least two path segments, e.g. primitives/button",
    };
  }

  const invalid = segments.find((segment) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment));
  if (invalid) {
    return {
      ok: false,
      error: `Invalid templateKey segment "${invalid}". Use kebab-case segments only.`,
    };
  }

  return { ok: true, segments };
}

export function getStarterTemplateDir(templateKey: string, cwd = process.cwd()): string {
  return path.join(cwd, STARTER_TEMPLATES_DIR, ...templateKey.split("/"));
}

export function getStarterTemplateManifestPath(templateKey: string, cwd = process.cwd()): string {
  return path.join(getStarterTemplateDir(templateKey, cwd), "template.json");
}

export function getDefaultStarterTemplateEntryFile(resourceType: string): string {
  const normalized = normalizeStarterTemplateResourceType(resourceType);
  if (normalized === REGISTRY_THEME_TYPE) return "files/theme.css";
  if (normalized === REGISTRY_BLOCK_TYPE || normalized === REGISTRY_UI_TYPE) {
    return "files/index.tsx";
  }
  return "files/index.txt";
}

export function getDefaultStarterTemplateFiles(resourceType: string): StarterTemplateFileRecord[] {
  const entryFile = getDefaultStarterTemplateEntryFile(resourceType);
  const files: StarterTemplateFileRecord[] = [{ path: entryFile, kind: "entry" }];

  if (normalizeStarterTemplateResourceType(resourceType) !== REGISTRY_THEME_TYPE) {
    files.push({ path: "README.md", kind: "docs" });
  }

  return files;
}

export function buildStarterTemplateManifest(input: {
  templateKey: string;
  resourceType: string;
  title: string;
  description?: string;
}): StarterTemplateManifest {
  const normalizedType = normalizeStarterTemplateResourceType(input.resourceType);
  return {
    schemaVersion: STARTER_TEMPLATE_SCHEMA_VERSION,
    templateKey: input.templateKey,
    resourceType: normalizedType,
    title: input.title,
    description: input.description?.trim() ?? "",
    entryFile: getDefaultStarterTemplateEntryFile(normalizedType),
    files: getDefaultStarterTemplateFiles(normalizedType),
    templateDependencies: [],
    declaredDependencies: [],
    previewStories: [],
    previewDefaultStoryId: null,
  };
}

export function buildStarterTemplateEntryContents(input: {
  resourceType: string;
  componentName: string;
  title: string;
}): string {
  const normalizedType = normalizeStarterTemplateResourceType(input.resourceType);

  if (normalizedType === REGISTRY_THEME_TYPE) {
    return [
      ":root {",
      "  --color-primary: #18181b;",
      "  --color-surface: #ffffff;",
      "  --radius-md: 0.75rem;",
      "}",
      "",
    ].join("\n");
  }

  if (normalizedType === REGISTRY_BLOCK_TYPE) {
    return [
      "\"use client\";",
      "",
      `export function ${input.componentName}Block() {`,
      "  return (",
      "    <section className=\"rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm\">",
      `      <h2 className=\"text-lg font-semibold text-zinc-900\">${input.title}</h2>`,
      "      <p className=\"mt-2 text-sm text-zinc-600\">Starter block template placeholder.</p>",
      "    </section>",
      "  );",
      "}",
      "",
      `export default ${input.componentName}Block;`,
      "",
    ].join("\n");
  }

  if (normalizedType === REGISTRY_UI_TYPE) {
    return [
      "type Props = {",
      "  label?: string;",
      "};",
      "",
      `export function ${input.componentName}(props: Props) {`,
      "  return (",
      "    <div className=\"inline-flex items-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm\">",
      "      {props.label ?? \"Starter template\"}",
      "    </div>",
      "  );",
      "}",
      "",
      `export default ${input.componentName};`,
      "",
    ].join("\n");
  }

  return `${input.title}\n`;
}

export function buildStarterTemplateReadme(input: {
  templateKey: string;
  resourceType: string;
  title: string;
}): string {
  return [
    `# ${input.templateKey}`,
    "",
    `Resource type: \`${normalizeStarterTemplateResourceType(input.resourceType)}\``,
    "",
    `Starter template for \`${input.title}\`.`,
    "",
  ].join("\n");
}

export function toComponentName(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}
