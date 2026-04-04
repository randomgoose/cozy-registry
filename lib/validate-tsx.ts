import path from "path";
import * as parser from "@babel/parser";
import {
  isBarePackageSpecifier,
  isBundleRootAliasImport,
  isRelativeModuleSpecifier,
  resolveBundleRootAliasImport,
} from "@/lib/module-specifiers";

export interface ValidateResult {
  valid: boolean;
  error?: string;
}

export interface BundleValidateResult extends ValidateResult {
  missingImports?: string[];
  invalidFiles?: string[];
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

export function isRelativeImport(specifier: string): boolean {
  return isRelativeModuleSpecifier(specifier);
}

function normalizePosix(p: string): string {
  return p.replaceAll("\\", "/");
}

export function isCodeFile(filePath: string): boolean {
  return /\.(tsx?|jsx?)$/i.test(filePath);
}

/** Resolve relative import to candidate paths (for bundle validation and dependency suggestions). */
export function resolveRelativeImport(importerPath: string, spec: string): string[] {
  const importer = normalizePosix(importerPath);
  const dir = path.posix.dirname(importer);
  const base = normalizePosix(path.posix.normalize(path.posix.join(dir, spec)));

  const hasExt = /\.[a-z0-9]+$/i.test(base);
  if (hasExt) return [base];

  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.posix.join(base, "index.ts"),
    path.posix.join(base, "index.tsx"),
    path.posix.join(base, "index.js"),
    path.posix.join(base, "index.jsx"),
  ];
}

export function findMissingRelativeImports(files: Record<string, string>): string[] {
  const keys = new Set(Object.keys(files).map(normalizePosix));
  const missing = new Set<string>();

  for (const [filePathRaw, content] of Object.entries(files)) {
    const filePath = normalizePosix(filePathRaw);
    if (!isCodeFile(filePath) || typeof content !== "string") continue;
    const imports = extractDependencies(content);
    for (const spec of imports) {
      let candidates: string[] = [];
      if (isRelativeImport(spec)) {
        candidates = resolveRelativeImport(filePath, spec);
      } else if (isBundleRootAliasImport(spec)) {
        candidates = resolveBundleRootAliasImport(spec);
      } else {
        continue;
      }
      const ok = candidates.some((candidate) => keys.has(candidate));
      if (!ok) missing.add(`${filePath} -> ${spec}`);
    }
  }

  return Array.from(missing).sort();
}

export function validateComponentBundle(
  files: Record<string, string>,
): BundleValidateResult {
  const codeEntries = Object.entries(files).filter(
    ([filePath, content]) => isCodeFile(filePath) && typeof content === "string",
  );

  if (codeEntries.length === 0) {
    return {
      valid: false,
      error: "Component bundle must include at least one .ts, .tsx, .js, or .jsx file",
    };
  }

  const invalidFiles: string[] = [];
  for (const [filePath, content] of codeEntries) {
    const validation = validateTsx(content);
    if (!validation.valid) {
      invalidFiles.push(`${normalizePosix(filePath)}: ${validation.error ?? "Invalid source"}`);
    }
  }

  if (invalidFiles.length > 0) {
    return {
      valid: false,
      error: "Component bundle contains invalid source files",
      invalidFiles,
    };
  }

  const missingImports = findMissingRelativeImports(files);
  if (missingImports.length > 0) {
    return {
      valid: false,
      error: "Component bundle is missing local import targets",
      missingImports,
    };
  }

  return { valid: true };
}

export { isBarePackageSpecifier };

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
    const ast = parser.parse(code, PARSE_OPTIONS) as unknown;
    const program = (ast as { program?: unknown }).program as
      | { body?: unknown[] }
      | undefined;
    const bodyNodes = Array.isArray(program?.body) ? program.body : [];

    let propsInterface: unknown = null;
    for (const node of bodyNodes) {
      if (!node || typeof node !== "object") continue;
      const rec = node as Record<string, unknown>;
      if (rec.type === "TSInterfaceDeclaration") {
        const id = rec.id as Record<string, unknown> | undefined;
        const name =
          id && id.type === "Identifier" && typeof id.name === "string" ? id.name : "";
        if (name.endsWith("Props") || name === "Props") {
          propsInterface = node;
          break;
        }
        if (!propsInterface) propsInterface = node;
      }
    }
    if (!propsInterface || typeof propsInterface !== "object") return [];
    const propsRec = propsInterface as Record<string, unknown>;
    if (propsRec.type !== "TSInterfaceDeclaration") return [];
    const ifaceBody = propsRec.body as Record<string, unknown> | undefined;
    if (!ifaceBody || ifaceBody.type !== "TSInterfaceBody") return [];
    const out: PropField[] = [];
    const members = (ifaceBody.body as unknown) ?? [];
    if (!Array.isArray(members)) return [];
    for (const member of members) {
      if (!member || typeof member !== "object") continue;
      const mem = member as Record<string, unknown>;
      if (mem.type !== "TSPropertySignature" || !mem.key) continue;
      const key = mem.key as Record<string, unknown>;
      const name =
        key.type === "Identifier"
          ? (key.name as string)
          : key.type === "StringLiteral"
            ? (key.value as string)
            : "";
      if (!name || (typeof name === "string" && (name === "key" || name === "ref"))) continue;
      const optional = typeof mem.optional === "boolean" ? mem.optional : false;
      const typeNode =
        (mem.typeAnnotation as Record<string, unknown> | undefined)?.typeAnnotation ?? undefined;
      const typeStr = typeNode ? typeAnnotationToString(typeNode) : "unknown";
      out.push({ name, type: typeStr, optional });
    }
    return out;
  } catch {
    return [];
  }
}

function typeAnnotationToString(node: unknown): string {
  if (!node || typeof node !== "object") return "unknown";
  const n = node as Record<string, unknown>;
  const t = n.type;
  if (typeof t !== "string") return "unknown";

  switch (t) {
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
      return typeAnnotationToString(n.elementType) + "[]";
    case "TSUnionType":
      return Array.isArray(n.types) ? n.types.map(typeAnnotationToString).join(" | ") : "unknown";
    case "TSLiteralType":
      if (!n.literal || typeof n.literal !== "object") return "literal";
      const literal = n.literal as Record<string, unknown>;
      if (literal.type === "StringLiteral" && typeof literal.value === "string")
        return `"${literal.value}"`;
      if (literal.type === "NumericLiteral" && typeof literal.value === "number")
        return String(literal.value);
      if (literal.type === "BooleanLiteral" && typeof literal.value === "boolean")
        return literal.value ? "true" : "false";
      return "literal";
    case "TSTypeReference":
      if (n.typeName && typeof n.typeName === "object") {
        const tn = n.typeName as Record<string, unknown>;
        if (tn.type === "Identifier" && typeof tn.name === "string") return tn.name;
      }
      return "unknown";
    case "TSFunctionType":
      return "function";
    case "TSIntersectionType":
      return Array.isArray(n.types) ? n.types.map(typeAnnotationToString).join(" & ") : "unknown";
    default:
      return "unknown";
  }
}
