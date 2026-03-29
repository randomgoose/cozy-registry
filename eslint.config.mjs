import { defineConfig, globalIgnores } from "eslint/config";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function loadTypeScriptEslint() {
  try {
    return (await import("typescript-eslint")).default;
  } catch {
    const rootDir = path.dirname(fileURLToPath(import.meta.url));
    const pnpmDir = path.join(rootDir, "node_modules", ".pnpm");
    const entry = readdirSync(pnpmDir).find((name) =>
      name.startsWith("typescript-eslint@"),
    );

    if (!entry) {
      throw new Error("Unable to resolve typescript-eslint");
    }

    const moduleUrl = pathToFileURL(
      path.join(
        pnpmDir,
        entry,
        "node_modules",
        "typescript-eslint",
        "dist",
        "index.js",
      ),
    ).href;

    return (await import(moduleUrl)).default;
  }
}

const tseslint = await loadTypeScriptEslint();

const eslintConfig = defineConfig(
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/apps/platform", "@/apps/platform/*"],
              message: "apps/web must not import the platform host. Use packages/* boundaries instead.",
            },
            {
              group: ["@/lib", "@/lib/*"],
              message: "Root lib has been removed. Import from packages/* instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/platform/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/apps/web", "@/apps/web/*"],
              message: "apps/platform must not import the web host.",
            },
            {
              group: ["@/lib", "@/lib/*"],
              message: "Root lib has been removed. Import from packages/* instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/apps", "@/apps/*"],
              message: "Workspace packages must not depend on app hosts.",
            },
            {
              group: ["@/lib", "@/lib/*"],
              message: "Root lib has been removed. Import from packages/* instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["bin/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib", "@/lib/*"],
              message: "CLI entrypoints should import from apps/* or packages/*, not root lib.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    "apps/web/dist/**",
    "node_modules/**",
    "out/**",
    "build/**",
  ]),
);

export default eslintConfig;
