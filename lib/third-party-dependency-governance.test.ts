import { describe, expect, it } from "vitest";
import {
  buildDependencySnapshot,
  excludeExplicitRegistryDependencies,
  evaluateThirdPartyDependencies,
  getPrebundleDependencies,
  getRejectedDependencyDecisions,
  getRuntimePreviewDependencies,
  hasRuntimeOnlyDependencies,
  readDependencyDecisionsFromMeta,
  readDependencySnapshotFromMeta,
  readDeclaredThirdPartyDependenciesFromMeta,
} from "@/lib/third-party-dependency-governance";

describe("third-party-dependency-governance", () => {
  it("defaults unknown packages to soft-allowed compatibility mode", () => {
    const [decision] = evaluateThirdPartyDependencies({
      discovered: ["date-fns"],
      declared: [],
    });

    expect(decision).toMatchObject({
      packageName: "date-fns",
      tier: "soft-allowed",
      previewCapability: "runtime-only",
      versionPolicyStatus: "unknown",
    });
  });

  it("requires explicit versions before trusted built-ins can prebundle", () => {
    const [unknownVersion] = evaluateThirdPartyDependencies({
      discovered: ["lucide-react"],
      declared: [],
    });
    const [knownVersion] = evaluateThirdPartyDependencies({
      discovered: ["lucide-react"],
      declared: [{ name: "lucide-react", version: "0.511.0" }],
    });

    expect(unknownVersion.previewCapability).toBe("runtime-only");
    expect(knownVersion.previewCapability).toBe("prebundle-supported");
    expect(getPrebundleDependencies([knownVersion])).toEqual(["lucide-react"]);
  });

  it("rejects node builtins at classification time", () => {
    const decisions = evaluateThirdPartyDependencies({
      discovered: ["node:fs", "fs"],
      declared: [],
    });

    expect(getRejectedDependencyDecisions(decisions)).toHaveLength(2);
    expect(getRuntimePreviewDependencies(decisions)).toEqual([]);
  });

  it("treats runtime-only decisions as degraded but valid", () => {
    const decisions = evaluateThirdPartyDependencies({
      discovered: ["date-fns"],
      declared: [{ name: "date-fns", version: "4.1.0" }],
    });

    expect(hasRuntimeOnlyDependencies(decisions)).toBe(true);
    expect(getRejectedDependencyDecisions(decisions)).toEqual([]);
  });

  it("reads declared dependencies from item meta", () => {
    expect(
      readDeclaredThirdPartyDependenciesFromMeta({
        declaredDependencies: [
          { name: "lucide-react", version: "0.511.0" },
          { name: "", version: "1.0.0" },
        ],
      }),
    ).toEqual([{ name: "lucide-react", version: "0.511.0" }]);
  });

  it("reads declared dependencies and decisions from dependency snapshot first", () => {
    const snapshot = buildDependencySnapshot({
      declared: [{ name: "lucide-react", version: "0.511.0" }],
      decisions: evaluateThirdPartyDependencies({
        discovered: ["lucide-react"],
        declared: [{ name: "lucide-react", version: "0.511.0" }],
      }),
    });

    expect(
      readDependencySnapshotFromMeta({
        dependencySnapshot: snapshot,
      }),
    ).toEqual(snapshot);
    expect(
      readDeclaredThirdPartyDependenciesFromMeta({
        dependencySnapshot: snapshot,
        declaredDependencies: [{ name: "date-fns", version: "4.1.0" }],
      }),
    ).toEqual([{ name: "lucide-react", version: "0.511.0" }]);
    expect(
      readDependencyDecisionsFromMeta({
        dependencySnapshot: snapshot,
        dependencyDecisions: evaluateThirdPartyDependencies({
          discovered: ["date-fns"],
          declared: [],
        }),
      }),
    ).toEqual(snapshot.dependencyDecisions);
  });

  it("excludes explicit registry dependencies from third-party governance", () => {
    expect(
      excludeExplicitRegistryDependencies(
        ["@acme/button", "@radix-ui/react-slot", "lucide-react"],
        ["@acme/button", "@acme/theme@1.2.0"],
      ),
    ).toEqual(["@radix-ui/react-slot", "lucide-react"]);
  });
});
