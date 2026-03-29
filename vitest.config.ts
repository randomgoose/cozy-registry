import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@cozy/ui": path.resolve(__dirname, "packages/ui/src"),
      "@cozy": path.resolve(__dirname, "packages"),
    },
  },
});
