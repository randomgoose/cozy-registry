import { describe, expect, it } from "vitest";
import {
  mergeRegistryDependenciesWithResolvedTheme,
  readResourceThemeOverride,
} from "@/lib/project-resource-relationships";

describe("project-resource-relationships", () => {
  it("reads a valid resource-level theme override", () => {
    expect(
      readResourceThemeOverride({
        themeResourceRef: "@indeed-cozy/ds/theme",
      }),
    ).toBe("@indeed-cozy/ds/theme");
  });

  it("ignores invalid resource-level theme overrides", () => {
    expect(
      readResourceThemeOverride({
        themeResourceRef: "not-a-registry-ref",
      }),
    ).toBeNull();
  });

  it("merges the resolved theme into registry dependencies without duplicates", () => {
    expect(
      mergeRegistryDependenciesWithResolvedTheme(
        ["@indeed-cozy/ds/theme", "@indeed-cozy/ds/button"],
        "@indeed-cozy/ds/theme",
      ),
    ).toEqual(["@indeed-cozy/ds/theme", "@indeed-cozy/ds/button"]);
  });
});
