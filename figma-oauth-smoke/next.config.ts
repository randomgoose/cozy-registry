import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** When this folder lives inside a monorepo, pin Turbopack root to silence wrong-root warnings. */
  turbopack: {
    root: configDir,
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/meta/as",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/meta/prm",
      },
    ];
  },
};

export default nextConfig;
