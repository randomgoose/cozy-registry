import * as parser from "@babel/parser";

export interface ValidateResult {
  valid: boolean;
  error?: string;
}

const PARSE_OPTIONS: parser.ParserOptions = {
  sourceType: "module",
  plugins: ["typescript", "jsx"],
};

/**
 * Basic TSX syntax validation. Ensures the code can be parsed.
 * Does not perform type checking or full compilation.
 */
export function validateTsx(code: string): ValidateResult {
  try {
    parser.parse(code, PARSE_OPTIONS);
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}

/**
 * Extract import sources from TSX/JS code (static import only).
 * Returns unique list of module specifiers, e.g. ["react", "@/components/ui"].
 * Returns [] if parse fails.
 */
export function extractDependencies(code: string): string[] {
  try {
    const ast = parser.parse(code, PARSE_OPTIONS);
    const deps = new Set<string>();
    for (const node of ast.program.body) {
      if (node.type === "ImportDeclaration" && node.source?.value) {
        const value = node.source.value;
        if (typeof value === "string" && value.length > 0) {
          deps.add(value);
        }
      }
    }
    return Array.from(deps).sort();
  } catch {
    return [];
  }
}
