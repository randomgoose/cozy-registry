import nextra from "nextra";
import fs from "node:fs";
import path from "node:path";
import {
  TRUSTED_BUILT_IN_DEPENDENCIES,
  TRUSTED_BUILT_IN_NAMESPACE_PREFIXES,
} from "./lib/third-party-dependency-catalog";

const withNextra = nextra({
  contentDirBasePath: "/docs",
});

function readInstalledTrustedPackages() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const declaredPackages = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);

  return Array.from(declaredPackages).filter((packageName) => {
    if (TRUSTED_BUILT_IN_DEPENDENCIES.includes(packageName as never)) return true;
    return TRUSTED_BUILT_IN_NAMESPACE_PREFIXES.some((prefix) =>
      packageName.startsWith(prefix),
    );
  });
}

function findPackageRootFromResolvedEntry(entryPath: string) {
  let current = path.dirname(fs.realpathSync(entryPath));
  const root = path.parse(current).root;

  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) {
      return current;
    }
    if (current === root) {
      throw new Error(`Unable to locate package root for resolved entry: ${entryPath}`);
    }
    current = path.dirname(current);
  }
}

function resolveTracingGlob(packageName: string) {
  const tryPackageJson = () => {
    try {
      return require.resolve(`${packageName}/package.json`);
    } catch {
      return null;
    }
  };

  const packageJsonPath = tryPackageJson();
  const resolvedEntryPath = packageJsonPath ?? require.resolve(packageName);
  const packageRoot = packageJsonPath
    ? path.dirname(fs.realpathSync(packageJsonPath))
    : findPackageRootFromResolvedEntry(resolvedEntryPath);
  const relativeRoot = path.relative(process.cwd(), packageRoot).replaceAll("\\", "/");
  return `./${relativeRoot}/**/*`;
}

// Temporary host compatibility bridge:
// these tracing globs keep currently installed trusted preview packages available
// in serverless output while the provider-owned asset model is still being rolled out.
// Long-term correctness must come from preview dependency provider assets / plans,
// not from the host app package.json or Next output tracing.
const TRUSTED_TRACING_GLOBS = readInstalledTrustedPackages().map(resolveTracingGlob);

const nextConfig = {
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/well-known/oauth-protected-resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/well-known/oauth-authorization-server" },
    ];
  },
  serverExternalPackages: ["esbuild"],
  outputFileTracingIncludes: {
    "/*": TRUSTED_TRACING_GLOBS,
  },
};

export default withNextra(nextConfig);
