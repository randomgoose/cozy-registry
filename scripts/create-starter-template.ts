#!/usr/bin/env tsx

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  buildStarterTemplateEntryContents,
  buildStarterTemplateManifest,
  buildStarterTemplateReadme,
  getStarterTemplateDir,
  getStarterTemplateManifestPath,
  toComponentName,
  validateStarterTemplateKey,
} from "@/lib/starter-template-format";

type CliOptions = {
  templateKey: string;
  resourceType: string;
  title: string;
  description: string;
  overwrite: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;

  const keyValidation = validateStarterTemplateKey(options.templateKey);
  if (!keyValidation.ok) {
    fail(keyValidation.error);
  }

  const templateDir = getStarterTemplateDir(options.templateKey);
  const manifestPath = getStarterTemplateManifestPath(options.templateKey);
  const manifest = buildStarterTemplateManifest({
    templateKey: options.templateKey,
    resourceType: options.resourceType,
    title: options.title,
    description: options.description,
  });
  const componentName = toComponentName(keyValidation.segments[keyValidation.segments.length - 1] ?? "Template");
  const entryContents = buildStarterTemplateEntryContents({
    resourceType: options.resourceType,
    componentName,
    title: options.title,
  });
  const readmeContents = buildStarterTemplateReadme({
    templateKey: options.templateKey,
    resourceType: options.resourceType,
    title: options.title,
  });

  await fs.mkdir(templateDir, { recursive: true });

  await writeFileSafe(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    options.overwrite,
  );
  await writeFileSafe(path.join(templateDir, "README.md"), readmeContents, options.overwrite);
  await writeFileSafe(
    path.join(templateDir, manifest.entryFile),
    entryContents,
    options.overwrite,
  );

  process.stdout.write(`Created starter template at ${templateDir}\n`);
  process.stdout.write(`- manifest: ${path.relative(process.cwd(), manifestPath)}\n`);
  process.stdout.write(`- entry: ${path.relative(process.cwd(), path.join(templateDir, manifest.entryFile))}\n`);
}

function parseArgs(args: string[]): CliOptions | null {
  if (args.length === 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    return null;
  }

  const templateKey = readFlag(args, "--template-key");
  const resourceType = readFlag(args, "--resource-type");
  const title = readFlag(args, "--title");
  const description = readFlag(args, "--description") ?? "";
  const overwrite = hasFlag(args, "--overwrite");

  if (!templateKey) fail("Missing required flag: --template-key");
  if (!resourceType) fail("Missing required flag: --resource-type");
  if (!title) fail("Missing required flag: --title");

  return {
    templateKey,
    resourceType,
    title,
    description,
    overwrite,
  };
}

function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function writeFileSafe(filePath: string, contents: string, overwrite: boolean) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (!overwrite) {
    try {
      await fs.access(filePath);
      fail(`Refusing to overwrite existing file: ${path.relative(process.cwd(), filePath)}. Re-run with --overwrite.`);
    } catch {
      // File does not exist, which is the expected path.
    }
  }

  await fs.writeFile(filePath, contents, "utf8");
}

function printHelp() {
  process.stdout.write(
    [
      "Create a starter template scaffold.",
      "",
      "Usage:",
      "  pnpm starter-template:new --template-key primitives/button --resource-type registry:ui --title Button",
      "",
      "Flags:",
      "  --template-key   Required. Path key like primitives/button or blocks/marketing-hero",
      "  --resource-type  Required. Resource type like registry:ui, registry:block, registry:theme",
      "  --title          Required. Human-readable title",
      "  --description    Optional. Manifest description",
      "  --overwrite      Optional. Replace existing template files",
      "",
    ].join("\n"),
  );
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
