/**
 * Umbrella categories for publish-time failures (roadmap Week 2).
 * Specific `code` values (e.g. REGDEP_*, PROV_*) roll up under VALIDATION_FAILED.
 */
export type PublishFailureCategory =
  | "VALIDATION_FAILED"
  | "PREVIEW_BUILD_FAILED"
  | "PREVIEW_RENDER_FAILED";

export function publishFailureCategoryForCode(
  code: string | undefined,
): PublishFailureCategory {
  if (code === "PREVIEW_BUILD_FAILED" || code === "PREVIEW_RENDER_FAILED") {
    return code;
  }
  return "VALIDATION_FAILED";
}
