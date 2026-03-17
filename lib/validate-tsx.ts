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
          // Figma Make 会把图片写成 `figma:asset/<hash>.png` 形式的 specifier；
          // 该路径只在 Figma Make 运行时有效，不应作为通用依赖参与 import map / CDN 解析。
          if (isFigmaAssetSpecifier(value)) continue;
          deps.add(value);
        }
      }
    }
    return Array.from(deps).sort();
  } catch {
    return [];
  }
}

function isFigmaAssetSpecifier(spec: string): boolean {
  // e.g. "figma:asset/xxxx.png"
  return spec.startsWith("figma:asset/");
}

export interface PropField {
  name: string;
  type: string;
  optional: boolean;
}

/**
 * Extract props interface from TSX (finds *Props interface used by component).
 * Returns array of { name, type, optional }. Returns [] if parse fails or no props interface found.
 */
export function extractPropsFromTsx(code: string): PropField[] {
  try {
    // 使用 any 避免依赖具体 @babel/parser 类型定义，兼容不同版本
    const ast: any = parser.parse(code, PARSE_OPTIONS);
    let propsInterface: any = null;
    for (const node of ast.program.body) {
      if (node.type === "TSInterfaceDeclaration") {
        const name = node.id.type === "Identifier" ? node.id.name : "";
        if (name.endsWith("Props") || name === "Props") {
          propsInterface = node;
          break;
        }
        if (!propsInterface) propsInterface = node;
      }
    }
    if (!propsInterface || propsInterface.type !== "TSInterfaceDeclaration") return [];
    const body = propsInterface.body;
    if (body.type !== "TSInterfaceBody") return [];
    const out: PropField[] = [];
    for (const member of body.body) {
      if (member.type !== "TSPropertySignature" || !member.key) continue;
      const key = member.key;
      const name =
        key.type === "Identifier"
          ? key.name
          : key.type === "StringLiteral"
            ? key.value
            : "";
      if (!name || (typeof name === "string" && (name === "key" || name === "ref"))) continue;
      const optional = member.optional ?? false;
      const typeNode = (member as any).typeAnnotation?.typeAnnotation;
      const typeStr = typeNode ? typeAnnotationToString(typeNode) : "unknown";
      out.push({ name, type: typeStr, optional });
    }
    return out;
  } catch {
    return [];
  }
}

function typeAnnotationToString(node: any): string {
  switch (node.type) {
    case "TSStringKeyword":
      return "string";
    case "TSNumberKeyword":
      return "number";
    case "TSBooleanKeyword":
      return "boolean";
    case "TSAnyKeyword":
      return "any";
    case "TSUnknownKeyword":
      return "unknown";
    case "TSVoidKeyword":
      return "void";
    case "TSNullKeyword":
      return "null";
    case "TSArrayType":
      return typeAnnotationToString(node.elementType) + "[]";
    case "TSUnionType":
      return node.types.map(typeAnnotationToString).join(" | ");
    case "TSLiteralType":
      if (node.literal.type === "StringLiteral") return `"${node.literal.value}"`;
      if (node.literal.type === "NumericLiteral") return String(node.literal.value);
      if (node.literal.type === "BooleanLiteral") return node.literal.value ? "true" : "false";
      return "literal";
    case "TSTypeReference":
      if (node.typeName.type === "Identifier") return node.typeName.name;
      return "unknown";
    case "TSFunctionType":
      return "function";
    case "TSIntersectionType":
      return node.types.map(typeAnnotationToString).join(" & ");
    default:
      return "unknown";
  }
}
