import { describe, expect, it } from "vitest";
import {
  buildScopedRegistryRef,
  parseScopedRegistryRef,
} from "@/lib/registry-identity";

describe("registry-identity", () => {
  it("builds and parses a project-scoped ref", () => {
    const ref = buildScopedRegistryRef({
      owner: "indeed-cozy",
      project: "design-system",
      name: "button",
      version: "1.2.0",
    });

    expect(ref).toBe("@indeed-cozy/design-system/button@1.2.0");
    expect(parseScopedRegistryRef(ref)).toEqual({
      owner: "indeed-cozy",
      project: "design-system",
      name: "button",
      version: "1.2.0",
    });
  });

  it("returns null for legacy owner-name refs", () => {
    expect(parseScopedRegistryRef("@indeed-cozy/button")).toBeNull();
  });
});
