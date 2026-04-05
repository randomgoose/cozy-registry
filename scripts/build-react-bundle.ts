/**
 * Build self-hosted React ESM bundles for preview import maps.
 *
 * Produces 4 ESM files that share the same React instance via import map:
 *   react.mjs            — standalone React core
 *   react-jsx-runtime.mjs — JSX runtime (imports "react" via import map)
 *   react-dom.mjs         — ReactDOM (imports "react" via import map)
 *   react-dom-client.mjs  — createRoot entry (imports "react-dom" via import map)
 *
 * Usage:
 *   npx tsx scripts/build-react-bundle.ts [--upload] [--out-dir <dir>]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.dev", override: true });
loadEnv({ path: ".env.local", override: true });

import * as esbuild from "esbuild";
import * as fs from "fs/promises";
import * as path from "path";
import { PREVIEW_REACT_VERSION } from "@/lib/preview-artifact-html";

const ENTRIES: {
  name: string;
  code: string;
  external: string[];
}[] = [
  {
    name: "react.mjs",
    code: `export * from "react"; import React from "react"; export default React;`,
    external: [],
  },
  {
    name: "react-jsx-runtime.mjs",
    code: `export * from "react/jsx-runtime";`,
    external: ["react"],
  },
  {
    name: "react-dom.mjs",
    code: `export * from "react-dom"; import ReactDOM from "react-dom"; export default ReactDOM;`,
    external: ["react"],
  },
  {
    name: "react-dom-client.mjs",
    code: `export * from "react-dom/client";`,
    external: ["react", "react-dom"],
  },
];

async function buildBundles(outDir: string) {
  await fs.mkdir(outDir, { recursive: true });

  const results: { name: string; path: string; size: number }[] = [];

  for (const entry of ENTRIES) {
    const result = await esbuild.build({
      stdin: {
        contents: entry.code,
        loader: "js",
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      target: ["es2018"],
      minify: true,
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
      },
      external: entry.external,
      write: false,
      logLevel: "silent",
    });

    const output = result.outputFiles?.[0]?.text;
    if (!output) throw new Error(`esbuild produced no output for ${entry.name}`);

    const outPath = path.join(outDir, entry.name);
    await fs.writeFile(outPath, output, "utf-8");
    results.push({ name: entry.name, path: outPath, size: output.length });
    console.log(`  ${entry.name}: ${(output.length / 1024).toFixed(1)} KB`);
  }

  return results;
}

async function uploadBundles(
  bundles: { name: string; path: string }[],
  version: string,
) {
  const { uploadPublicAsset } = await import("@/lib/storage");

  for (const bundle of bundles) {
    const body = await fs.readFile(bundle.path, "utf-8");
    const storagePath = `preview-react-bundles/${version}/${bundle.name}`;

    const uploaded = await uploadPublicAsset({
      path: storagePath,
      body,
      contentType: "application/javascript; charset=utf-8",
      cacheControl: "31536000",
      assetType: "preview-artifact",
    });

    console.log(`  Uploaded ${bundle.name} → ${uploaded.url}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldUpload = args.includes("--upload");
  const outDirIdx = args.indexOf("--out-dir");
  const outDir =
    outDirIdx >= 0 && args[outDirIdx + 1]
      ? args[outDirIdx + 1]
      : path.join(process.cwd(), ".react-bundles", PREVIEW_REACT_VERSION);

  console.log(
    `Building React ${PREVIEW_REACT_VERSION} ESM bundles → ${outDir}`,
  );
  const bundles = await buildBundles(outDir);

  if (shouldUpload) {
    console.log(`\nUploading to storage...`);
    await uploadBundles(bundles, PREVIEW_REACT_VERSION);
    console.log(`\nDone. React ${PREVIEW_REACT_VERSION} bundles uploaded.`);
  } else {
    console.log(
      `\nBuilt locally. Use --upload to push to Supabase storage.`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
