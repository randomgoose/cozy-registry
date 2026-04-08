import { describe, expect, it } from "vitest";
import {
  mergeRegistryDependenciesWithResolvedThemes,
  mergeThemeLayers,
  readResourceThemeLayers,
} from "@/lib/project-resource-relationships";

describe("project-resource-relationships", () => {
  it("reads valid resource-level theme layers", () => {
    expect(
      readResourceThemeLayers({
        themeResourceRefs: [
          "@indeed-cozy/ds/theme",
          "@indeed-cozy/ds/components",
        ],
      }),
    ).toEqual([
      "@indeed-cozy/ds/theme",
      "@indeed-cozy/ds/components",
    ]);
  });

  it("falls back to the legacy single theme field", () => {
    expect(
      readResourceThemeLayers({
        themeResourceRef: "@indeed-cozy/ds/theme",
      }),
    ).toEqual(["@indeed-cozy/ds/theme"]);
  });

  it("merges project and resource theme layers with stable ordering", () => {
    expect(
      mergeThemeLayers({
        projectThemeResourceRefs: ["@indeed-cozy/ds/theme"],
        resourceThemeResourceRefs: [
          "@indeed-cozy/ds/theme",
          "@indeed-cozy/ds/components",
        ],
      }),
    ).toEqual({
      resolvedThemeResourceRefs: [
        "@indeed-cozy/ds/theme",
        "@indeed-cozy/ds/components",
      ],
      resolvedThemeLayerSources: ["project-default", "resource-layer"],
    });
  });

  it("merges resolved theme layers into registry dependencies without duplicates", () => {
    expect(
      mergeRegistryDependenciesWithResolvedThemes(
        ["@indeed-cozy/ds/theme", "@indeed-cozy/ds/button"],
        ["@indeed-cozy/ds/theme", "@indeed-cozy/ds/components"],
      ),
    ).toEqual([
      "@indeed-cozy/ds/theme",
      "@indeed-cozy/ds/button",
      "@indeed-cozy/ds/components",
    ]);
  });
});
