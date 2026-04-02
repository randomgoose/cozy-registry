import nextra from "nextra";
import { TRUSTED_BUILT_IN_DEPENDENCIES } from "./lib/third-party-dependency-catalog";

const withNextra = nextra({
  contentDirBasePath: "/docs",
});

function toTracingGlob(packageName: string) {
  return `./node_modules/${packageName}/**/*`;
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
    "/*": TRUSTED_BUILT_IN_DEPENDENCIES.map(toTracingGlob),
  },
};

export default withNextra(nextConfig);
