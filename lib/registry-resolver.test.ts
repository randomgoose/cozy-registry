import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createRegistryResolverMemo,
  resolveRegistryDependencies,
} from "@/lib/registry-resolver";
import {
  RegistryDependencyCycleError,
  RegistryDependencyPermissionDeniedError,
} from "@/lib/registry-dependency-errors";
import * as registry from "@/lib/registry";

vi.mock("@/lib/registry", () => ({
  getRegistryDependencyAccessForScopedRef: vi.fn(),
  getRegistryItemByScopedIdentityAndVersion: vi.fn(),
  getThemeEntryCss: vi.fn(),
}));

const mockAccess = registry.getRegistryDependencyAccessForScopedRef as ReturnType<
  typeof vi.fn
>;
const mockGetItem = registry.getRegistryItemByScopedIdentityAndVersion as ReturnType<
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
      async (input: { name: string }) => {
        if (input.name === "a") {
          return {
            ...minimalItem(),
            registryDependencies: ["@alice/b"],
            name: "a",
          };
        }
        if (input.name === "b") {
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
    mockAccess.mockImplementation(
      async (input: { itemName: string }) => {
        if (input.itemName === "secret") return "denied";
        return "ok";
      },
    );
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

  it("memoizes repeated access and item fetches within a request", async () => {
    const memo = createRegistryResolverMemo();

    mockGetItem.mockImplementation(async (input: { name: string }) => {
      if (input.name === "root") {
        return {
          ...minimalItem(),
          name: "root",
          registryDependencies: ["@alice/shared-a", "@alice/shared-b"],
        };
      }
      if (input.name === "shared-a" || input.name === "shared-b") {
        return {
          ...minimalItem(),
          name: input.name,
          registryDependencies: ["@alice/leaf"],
        };
      }
      if (input.name === "leaf") {
        return {
          ...minimalItem(),
          name: "leaf",
          registryDependencies: [],
        };
      }
      return null;
    });

    await resolveRegistryDependencies({
      owner: "alice",
      name: "root",
      version: null,
      requestUserId: "u1",
      memo,
    });

    expect(mockAccess).toHaveBeenCalledTimes(4);
    expect(mockGetItem).toHaveBeenCalledTimes(4);
  });

  it("resolves project-scoped dependency refs", async () => {
    mockAccess.mockImplementation(async () => "ok");
    mockGetItem.mockImplementation(
      async (input: {
        ownerId: string;
        projectKey: string | null;
        name: string;
        version: string | null;
      }) => {
        if (input.name === "root") {
          return {
            ...minimalItem(),
            name: "root",
            registryDependencies: ["@indeed-cozy/design-system/button"],
          };
        }
        if (
          input.ownerId === "indeed-cozy" &&
          input.projectKey === "design-system" &&
          input.name === "button"
        ) {
          return {
            ...minimalItem(),
            name: "button",
            registryDependencies: [],
          };
        }
        return null;
      },
    );

    const resolved = await resolveRegistryDependencies({
      owner: "indeed-cozy",
      name: "root",
      version: null,
      requestUserId: "u1",
    });

    expect(resolved.ordered.map((node) => node.ref.ref)).toContain(
      "@indeed-cozy/design-system/button",
    );
  });
});
