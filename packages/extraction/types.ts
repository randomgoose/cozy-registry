/**
 * Extraction phase types (component discovery from source).
 * Publish/registry persistence uses `normalizePublishContract` + `createRegistryItem`;
 * extraction is a separate step that may feed PublishInput in product flows.
 *
 * @see docs/00-overview/registry-design-principles.md
 */

export type FileEntry = {
  path: string;
  content: string;
};

export type ExtractionInput = {
  /** Entry module path within the bundle, e.g. "App.tsx" */
  entryFile: string;
  files: FileEntry[];
};

export type ExtractionConfidence = "high" | "medium" | "low";

/** Future: filled by AST / heuristics; v0 is types-only. */
export type ExtractedComponent = {
  name: string;
  files: FileEntry[];
  confidence: ExtractionConfidence;
  /** Human-readable, e.g. "repeated 3 times" */
  reasons: string[];
};

export type ExtractionResult = {
  components: ExtractedComponent[];
};
