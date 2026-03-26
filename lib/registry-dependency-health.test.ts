import { describe, expect, it } from "vitest";
import { compareSemver } from "./registry-dependency-health";

describe("compareSemver", () => {
  it("orders major", () => {
    expect(compareSemver("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.0.0")).toBeGreaterThan(0);
  });

  it("orders patch", () => {
    expect(compareSemver("1.0.0", "1.0.1")).toBeLessThan(0);
  });

  it("equal", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });
});
