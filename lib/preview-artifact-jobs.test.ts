import { describe, expect, it } from "vitest";
import {
  buildPreviewArtifactKey,
  buildWarmPreviewArtifactTargets,
  classifyPreviewArtifactCapability,
  formatRuntimeOnlyDependencySkipMessage,
  inferPreviewArtifactCapability,
} from "@/lib/preview-artifact-jobs";

describe("preview-artifact-jobs", () => {
  it("includes project scope in the artifact key", () => {
    const designSystemKey = buildPreviewArtifactKey({
      itemId: "item-1",
      itemVersionId: "version-1",
      owner: "indeed-cozy",
      project: "design-system",
      name: "button",
      version: "0.1.1",
      mode: "default",
      storyId: null,
    });
    const dashboardKey = buildPreviewArtifactKey({
      itemId: "item-2",
      itemVersionId: "version-2",
      owner: "indeed-cozy",
      project: "dashboard",
      name: "button",
      version: "0.1.1",
      mode: "default",
      storyId: null,
    });

    expect(designSystemKey).not.toBe(dashboardKey);
  });

  it("builds warm targets for default and declared stories", () => {
    const targets = buildWarmPreviewArtifactTargets({
      previewDefaultStoryId: "destructive",
      previewStories: [
        { id: "default", title: "Default" },
        { id: "destructive", title: "Destructive" },
      ],
    });

    expect(targets).toEqual([
      { mode: "default", storyId: "destructive" },
      { mode: "thumbnail", storyId: "destructive" },
      { mode: "default", storyId: "default" },
    ]);
  });

  it("falls back to component-level targets when no stories are declared", () => {
    const targets = buildWarmPreviewArtifactTargets(null);

    expect(targets).toEqual([
      { mode: "default", storyId: null },
      { mode: "thumbnail", storyId: null },
    ]);
  });

  it("formats skipped message with concrete runtime-only dependencies", () => {
    const message = formatRuntimeOnlyDependencySkipMessage([
      {
        packageName: "react",
        requestedVersion: "19.2.0",
        tier: "runtime-provided",
        previewCapability: "runtime-only",
        versionPolicyStatus: "accepted",
        message: "Provided by the platform runtime; prebundle is not needed.",
      },
      {
        importSpecifier: "@radix-ui/react-slot",
        packageName: "@radix-ui/react-slot",
        requestedVersion: "1.2.4",
        tier: "soft-allowed",
        previewCapability: "runtime-only",
        versionPolicyStatus: "accepted",
        message: "Allowed in compatibility mode.",
      },
      {
        packageName: "class-variance-authority",
        requestedVersion: "0.7.1",
        tier: "trusted-built-in",
        previewCapability: "prebundle-supported",
        versionPolicyStatus: "accepted",
        message: "Approved for prebundle.",
      },
      {
        importSpecifier: "motion/react",
        packageName: "motion",
        requestedVersion: null,
        tier: "soft-allowed",
        previewCapability: "runtime-only",
        versionPolicyStatus: "unknown",
        message: "Missing explicit version.",
      },
    ]);

    expect(message).toBe(
      "Artifact prebundle was skipped by policy because these dependencies are runtime-only: @radix-ui/react-slot, motion/react.",
    );
  });

  it("classifies runtime-only third-party dependencies as compatible artifacts", () => {
    const capability = classifyPreviewArtifactCapability([
      {
        packageName: "react",
        requestedVersion: "19.2.0",
        tier: "runtime-provided",
        previewCapability: "runtime-only",
        versionPolicyStatus: "accepted",
        message: "Provided by the platform runtime.",
      },
      {
        importSpecifier: "@base-ui/react/dialog",
        packageName: "@base-ui/react",
        requestedVersion: null,
        tier: "trusted-built-in",
        previewCapability: "runtime-only",
        versionPolicyStatus: "unknown",
        message: "Known package without an explicit version.",
      },
    ]);

    expect(capability).toBe("compatible-artifact");
  });

  it("infers runtime-only capability for legacy skipped artifacts", () => {
    const capability = inferPreviewArtifactCapability({
      artifactStatus: "skipped",
      dependencyDecisions: [],
    });

    expect(capability).toBe("runtime-only");
  });
});
