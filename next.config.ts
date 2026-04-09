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
  serverExternalPackages: [
    "esbuild",
    // pacote pulls @npmcli/run-script → node-gyp (includes .cs); must not be bundled by Turbopack
    "pacote",
    "node-gyp",
    "@npmcli/run-script",
  ],
};

export default withNextra(nextConfig);
