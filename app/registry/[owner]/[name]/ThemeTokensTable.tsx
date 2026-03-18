"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FileEntry = { path: string; content: string; type: string };

type TokenRow = {
  name: string;
  cssVar: string;
  type?: string;
  value: string;
};

function parseTokensFromJson(raw: string): TokenRow[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }

  const obj = data as any;
  const rows: TokenRow[] = [];

  function makeCssVar(path: string[]): string {
    const safe = (path.length ? path : ["token"])
      .join("-")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/--+/g, "-")
      .toLowerCase();
    return `--${safe}`;
  }

  // W3C-ish tokens
  function walkW3C(node: any, path: string[]) {
    if (!node || typeof node !== "object") return;
    const hasValue = Object.prototype.hasOwnProperty.call(node, "value");
    const hasType = Object.prototype.hasOwnProperty.call(node, "type");
    if (hasValue && (typeof node.value === "string" || typeof node.value === "number")) {
      rows.push({
        name: path.join(".") || "token",
        cssVar: makeCssVar(path),
        type: hasType ? String(node.type) : undefined,
        value: String(node.value),
      });
      return;
    }
    for (const key of Object.keys(node)) {
      walkW3C(node[key], [...path, key]);
    }
  }

  // Figma Variables
  function collectFigma(node: any): boolean {
    if (!node || typeof node !== "object") return false;
    const variables = node.variables;
    const modes = node.modes;
    if (!variables || !modes || typeof variables !== "object") return false;

    const modeIds: string[] = Array.isArray(modes)
      ? modes.map((m: any) => String(m.modeId ?? m.id)).filter(Boolean)
      : Object.keys(modes);
    const defaultMode = modeIds[0];
    if (!defaultMode) return false;

    for (const varId of Object.keys(variables)) {
      const v = variables[varId];
      if (!v) continue;
      const name: string = v.name ?? v.key ?? varId;
      const path = name.split(/[\/.]/g).filter(Boolean);
      let value: any;
      const valuesByMode = v.valuesByMode ?? v.resolvedValuesByMode;
      if (valuesByMode && typeof valuesByMode === "object") {
        value = valuesByMode[defaultMode] ?? Object.values(valuesByMode)[0];
      }
      if (value == null) continue;
      rows.push({
        name: path.join(".") || name,
        cssVar: makeCssVar(path.length ? path : [name]),
        type: v.type ? String(v.type) : undefined,
        value: typeof value === "string" ? value : JSON.stringify(value),
      });
    }
    return rows.length > 0;
  }

  const isFigma = collectFigma(obj);
  if (!isFigma) {
    walkW3C(obj, []);
  }

  return rows;
}

export function ThemeTokensTable(props: { files: FileEntry[] }) {
  const tokensJsonFile = props.files.find((f) =>
    f.path.toLowerCase().endsWith(".json"),
  );

  const rows = useMemo(
    () => (tokensJsonFile ? parseTokensFromJson(tokensJsonFile.content) : []),
    [tokensJsonFile],
  );

  if (!tokensJsonFile || rows.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Tokens（来自 {tokensJsonFile.path}）
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="max-h-[360px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">Name</TableHead>
                <TableHead className="w-1/4">CSS var</TableHead>
                <TableHead className="w-1/6">Type</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={`${t.name}-${t.cssVar}`}>
                  <TableCell className="font-mono text-xs">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs">{t.cssVar}</TableCell>
                  <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t.type ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

