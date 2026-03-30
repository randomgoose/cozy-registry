import { describe, expect, it } from "vitest";
import { diagnosePublishReadiness } from "./diagnose-publish-readiness";

describe("diagnosePublishReadiness", () => {
  it("returns structured failure for invalid name", async () => {
    const r = await diagnosePublishReadiness({
      name: "Bad_Name",
      type: "registry:block",
      content: 'export default function X() { return null; }',
      input: {},
      requestUserId: "user-1",
      runPreviewSmoke: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureCategory).toBe("VALIDATION_FAILED");
      expect(r.code).toBe("INVALID_NAME");
      expect(r.step).toBe("name_format");
    }
  });

  it("passes contract for minimal valid block without smoke", async () => {
    const r = await diagnosePublishReadiness({
      name: "hero-block",
      type: "registry:block",
      content: 'export default function Hero() { return <div />; }',
      input: {},
      requestUserId: "user-1",
      runPreviewSmoke: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.runPreviewSmoke).toBe(false);
      expect(r.publishDiagnostics).toBeDefined();
    }
  });

  it("returns previewAdvice for named export components", async () => {
    const r = await diagnosePublishReadiness({
      name: "kpi-card",
      type: "registry:ui",
      content: `
        export function KPICard() {
          return null;
        }
      `,
      input: {},
      requestUserId: "user-1",
      runPreviewSmoke: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previewAdvice?.hasDefaultExport).toBe(false);
    expect(r.previewAdvice?.detectedExports).toContain("KPICard");
    expect(r.previewAdvice?.recommendedPreviewExport).toBe("KPICard");
  });
});
