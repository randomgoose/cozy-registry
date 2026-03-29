export type ParsedToken = {
  path: string[];
  value: string;
  type?: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

export function parseTokensFromJson(raw: string): ParsedToken[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const obj = isRecord(data) ? data : {};
  const tokens: ParsedToken[] = [];

  // W3C-style nested tokens
  function walkW3C(node: unknown, path: string[]) {
    if (!isRecord(node)) return;
    const hasValue = Object.prototype.hasOwnProperty.call(node, "value");
    const hasType = Object.prototype.hasOwnProperty.call(node, "type");
    const value = node.value;
    const type = node.type;
    if (hasValue && (typeof value === "string" || typeof value === "number")) {
      tokens.push({
        path,
        value: String(value),
        type: hasType && typeof type !== "undefined" ? String(type) : undefined,
      });
      return;
    }
    for (const key of Object.keys(node)) {
      walkW3C(node[key], [...path, key]);
    }
  }

  // Figma Variables JSON
  function collectFigma(node: unknown): boolean {
    if (!isRecord(node)) return false;
    const variables = node.variables;
    const modes = node.modes;
    if (!isRecord(variables) || (!Array.isArray(modes) && !isRecord(modes))) return false;

    const modeIds: string[] = Array.isArray(modes)
      ? modes
          .map((mode) =>
            isRecord(mode) ? String(mode.modeId ?? mode.id ?? "") : "",
          )
          .filter(Boolean)
      : Object.keys(modes);
    const defaultMode = modeIds[0];
    if (!defaultMode) return false;

    for (const varId of Object.keys(variables)) {
      const v = variables[varId];
      if (!isRecord(v)) continue;
      const name = String(v.name ?? v.key ?? varId);
      const path = name.split(/[\/.]/g).filter(Boolean);
      let value: unknown;
      const valuesByMode = v.valuesByMode ?? v.resolvedValuesByMode;
      if (isRecord(valuesByMode)) {
        value = valuesByMode[defaultMode] ?? Object.values(valuesByMode)[0];
      }
      if (value == null) continue;
      tokens.push({
        path,
        value: typeof value === "string" ? value : JSON.stringify(value),
        type: v.type ? String(v.type) : undefined,
      });
    }
    return tokens.length > 0;
  }

  const isFigma = collectFigma(obj);
  if (!isFigma) {
    walkW3C(obj, []);
  }

  return tokens;
}

export function tokensToRootCss(tokens: ParsedToken[]): string {
  if (tokens.length === 0) return "";
  const makeVar = (path: string[]): string => {
    const safe = (path.length ? path : ["token"])
      .join("-")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/--+/g, "-")
      .toLowerCase();
    return `--${safe}`;
  };

  const lines: string[] = [];
  lines.push(":root {");
  for (const t of tokens) {
    lines.push(`  ${makeVar(t.path)}: ${t.value};`);
  }
  lines.push("}");
  return lines.join("\n");
}
