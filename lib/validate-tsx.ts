import * as parser from "@babel/parser";

export interface ValidateResult {
  valid: boolean;
  error?: string;
}

/**
 * Basic TSX syntax validation. Ensures the code can be parsed.
 * Does not perform type checking or full compilation.
 */
export function validateTsx(code: string): ValidateResult {
  try {
    parser.parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}
