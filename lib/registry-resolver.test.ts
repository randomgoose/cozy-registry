import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveRegistryDependencies } from "@/lib/registry-resolver";
import {
  RegistryDependencyCycleError,
  RegistryDependencyPermissionDeniedError,
} from "@/lib/registry-dependency-errors";
import * as registry from "@/lib/registry";

vi.mock("@/lib/registry", () => ({
  getRegistryDependencyAccessForRef: vi.fn(),
  getRegistryItemByOwnerNameAndVersion: vi.fn(),
  getThemeEntryCss: vi.fn(),
}));

const mockAccess = registry.getRegistryDependencyAccessForRef as ReturnType<
  typeof vi.fn
>;
const mockGetItem = registry.getRegistryItemByOwnerNameAndVersion as ReturnType<
  typeof vi.fn
>;

function minimalItem(overrides: Partial<{ registryDependencies: string[] }> = {}) {
  return {
    registryDependencies: overrides.registryDependencies ?? [],
    files: [{ path: "index.tsx", content: "export {}", type: "registry:ui" }],
    type: "registry:ui",
    userId: "u1",
    visibility: "public" as const,
  };
}

describe("resolveRegistryDependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockResolvedValue("ok");
  });

  it("detects cycle and throws RegistryDependencyCycleError", async () => {
    mockGetItem.mockImplementation(
      async (_owner: string, name: string) => {
        if (name === "a") {
          return {
            ...minimalItem(),
            registryDependencies: ["@alice/b"],
            name: "a",
          };
        }
        if (name === "b") {
          return {
            ...minimalItem(),
            registryDependencies: ["@alice/a"],
            name: "b",
          };
        }
        return null;
      },
    );

    await expect(
      resolveRegistryDependencies({
        owner: "alice",
        name: "a",
        version: null,
        requestUserId: "u1",
      }),
    ).rejects.toBeInstanceOf(RegistryDependencyCycleError);
  });

  it("throws RegistryDependencyPermissionDeniedError when access denied", async () => {
    mockAccess.mockImplementation(async (_o: string, name: string) => {
      if (name === "secret") return "denied";
      return "ok";
    });
    mockGetItem.mockResolvedValue({
      ...minimalItem(),
      registryDependencies: ["@alice/secret"],
      name: "root",
    });

    await expect(
      resolveRegistryDependencies({
        owner: "alice",
        name: "root",
        version: null,
        requestUserId: "other",
      }),
    ).rejects.toBeInstanceOf(RegistryDependencyPermissionDeniedError);
  });
});
