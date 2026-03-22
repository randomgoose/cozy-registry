import type { PropField } from "@/lib/validate-tsx";

export type ControllableKind = "string" | "number" | "boolean" | "enum";

export type ControllablePropMeta = {
  kind: ControllableKind;
  /** For string-literal unions */
  enumOptions?: string[];
};

/**
 * Map extracted TS prop types to simple preview controls.
 * Skips ReactNode, complex refs, functions, etc.
 */
export function getControllablePropMeta(field: PropField): ControllablePropMeta | null {
  const t = field.type.trim();

  if (t === "string") return { kind: "string" };
  if (t === "number") return { kind: "number" };
  if (t === "boolean") return { kind: "boolean" };

  const quoted = [...t.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) =>
    m[1]!.replace(/\\"/g, '"'),
  );
  if (quoted.length >= 1 && t.includes("|")) {
    const options = quoted.filter((q) => q.length > 0);
    if (options.length >= 1) return { kind: "enum", enumOptions: options };
  }

  return null;
}

export function filterControllableProps(fields: PropField[]): PropField[] {
  return fields.filter((f) => getControllablePropMeta(f) != null);
}
