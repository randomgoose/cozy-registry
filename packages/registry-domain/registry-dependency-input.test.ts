import { describe, expect, it } from "vitest";
import { normalizeRegistryDependenciesInput } from "@cozy/registry-domain/registry-dependency-input";

describe("normalizeRegistryDependenciesInput", () => {
  it("accepts valid refs, trims and dedupes", () => {
    const { value, error } = normalizeRegistryDependenciesInput([
      "  @alice/a  ",
      "@alice/a",
      "@bob/x@1.0.0",
    ]);
    expect(error).toBeUndefined();
    expect(value).toEqual(["@alice/a", "@bob/x@1.0.0"]);
  });

  it("rejects invalid ref format", () => {
    const { error } = normalizeRegistryDependenciesInput(["not-a-ref"]);
    expect(error).toMatch(/Invalid registry dependency ref/);
  });

  it("rejects null with explicit guidance", () => {
    const { error } = normalizeRegistryDependenciesInput(null);
    expect(error).toMatch(/cannot be null/);
  });

  it("treats undefined as empty when used directly", () => {
    const { value, error } = normalizeRegistryDependenciesInput(undefined);
    expect(error).toBeUndefined();
    expect(value).toEqual([]);
  });

  it("rejects non-array", () => {
    const { error } = normalizeRegistryDependenciesInput("x");
    expect(error).toMatch(/must be an array/);
  });
});
