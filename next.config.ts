import nextra from "nextra";
import {
  TRUSTED_BUILT_IN_DEPENDENCIES,
  TRUSTED_BUILT_IN_NAMESPACE_PREFIXES,
} from "./lib/third-party-dependency-catalog";

const withNextra = nextra({
  contentDirBasePath: "/docs",
});

function toTracingGlob(packageName: string) {
  return `./node_modules/${packageName}/**/*`;
}

function toNamespaceTracingGlob(prefix: string) {
  const trimmed = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return `./node_modules/${trimmed}/**/*`;
}

const nextConfig = {
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/well-known/oauth-protected-resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/well-known/oauth-authorization-server" },
    ];
  },
  serverExternalPackages: ["esbuild"],
  outputFileTracingIncludes: {
    "/*": [
      ...TRUSTED_BUILT_IN_DEPENDENCIES.map(toTracingGlob),
      ...TRUSTED_BUILT_IN_NAMESPACE_PREFIXES.map(toNamespaceTracingGlob),
    ],
  },
};

export default withNextra(nextConfig);
