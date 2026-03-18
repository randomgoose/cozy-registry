import nextra from "nextra";

const withNextra = nextra({
  contentDirBasePath: "/docs",
});

const nextConfig = {
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/well-known/oauth-protected-resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/well-known/oauth-authorization-server" },
    ];
  },
  serverExternalPackages: ["esbuild"],
};

export default withNextra(nextConfig);
