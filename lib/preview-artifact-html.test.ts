import { afterEach, describe, expect, it } from "vitest";
import { buildArtifactPreviewHtml } from "@/lib/preview-artifact-html";

const originalEnv = {
  COZY_USE_SELF_HOSTED_PREVIEW_REACT:
    process.env.COZY_USE_SELF_HOSTED_PREVIEW_REACT,
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_PREVIEW_ARTIFACT_BUCKET: process.env.SUPABASE_PREVIEW_ARTIFACT_BUCKET,
  NEXT_PUBLIC_SUPABASE_PREVIEW_ARTIFACT_BUCKET:
    process.env.NEXT_PUBLIC_SUPABASE_PREVIEW_ARTIFACT_BUCKET,
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("preview-artifact-html", () => {
  it("defaults to esm.sh React runtimes even when Supabase env vars are present", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PREVIEW_ARTIFACT_BUCKET = "registry-preview-artifacts";
    delete process.env.COZY_USE_SELF_HOSTED_PREVIEW_REACT;

    const html = buildArtifactPreviewHtml({
      jsUrl: "https://cdn.example.com/preview.js",
      compatibleExternals: [],
      mode: "default",
      bundledReact: false,
    });

    expect(html).toContain("https://esm.sh/react@19.2.3?dev");
    expect(html).not.toContain("/preview-react-bundles/19.2.3/react.mjs");
  });

  it("uses self-hosted React runtimes only when explicitly enabled", () => {
    process.env.COZY_USE_SELF_HOSTED_PREVIEW_REACT = "true";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PREVIEW_ARTIFACT_BUCKET = "registry-preview-artifacts";

    const html = buildArtifactPreviewHtml({
      jsUrl: "https://cdn.example.com/preview.js",
      compatibleExternals: [],
      mode: "default",
      bundledReact: false,
    });

    expect(html).toContain(
      "https://example.supabase.co/storage/v1/object/public/registry-preview-artifacts/preview-react-bundles/19.2.3/react.mjs",
    );
  });
});
