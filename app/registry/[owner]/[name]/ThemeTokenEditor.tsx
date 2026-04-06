"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TokenType =
  | "color"
  | "dimension"
  | "number"
  | "fontFamily"
  | "other";

type ThemeTokenRow = {
  id: string;
  name: string;
  value: string;
  type: TokenType;
};

interface ThemeTokenEditorProps {
  owner: string;
  name: string;
  title: string;
  code: string;
  isOwner: boolean;
  canSave: boolean;
}

function stripRegistryHeader(input: string) {
  if (input.startsWith("/* cozy-registry:")) {
    const end = input.indexOf("*/");
    if (end >= 0) {
      return input.slice(end + 2).trimStart();
    }
  }

  if (input.startsWith("// cozy-registry:")) {
    const end = input.indexOf("\n");
    if (end >= 0) {
      return input.slice(end + 1).trimStart();
    }
  }

  return input;
}

function inferTokenType(name: string, value: string): TokenType {
  const normalizedName = name.toLowerCase();
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedName.includes("color") ||
    normalizedName.includes("background") ||
    normalizedName.includes("foreground") ||
    normalizedName.includes("border") ||
    normalizedName.includes("ring") ||
    normalizedValue.startsWith("#") ||
    normalizedValue.startsWith("rgb") ||
    normalizedValue.startsWith("hsl") ||
    normalizedValue.startsWith("oklch") ||
    normalizedValue.startsWith("oklab")
  ) {
    return "color";
  }

  if (
    normalizedName.includes("font") ||
    normalizedValue.includes(",") ||
    normalizedValue.includes('"') ||
    normalizedValue.includes("'")
  ) {
    return "fontFamily";
  }

  if (
    /^-?\d+(\.\d+)?$/.test(normalizedValue) ||
    normalizedName.includes("opacity") ||
    normalizedName.includes("weight")
  ) {
    return "number";
  }

  if (
    normalizedName.includes("radius") ||
    normalizedName.includes("spacing") ||
    normalizedName.includes("size") ||
    /-?\d+(\.\d+)?(px|rem|em|%|vh|vw|svh|svw)$/.test(normalizedValue)
  ) {
    return "dimension";
  }

  return "other";
}

function parseThemeCss(rawCode: string) {
  const css = stripRegistryHeader(rawCode);
  const rootMatch = css.match(/:root\s*{([\s\S]*?)}/m);
  const rootBody = rootMatch?.[1] ?? "";
  const tokenRegex = /--([A-Za-z0-9-_]+)\s*:\s*([^;]+);/g;
  const rows: ThemeTokenRow[] = [];

  for (const match of rootBody.matchAll(tokenRegex)) {
    const tokenName = match[1]?.trim();
    const tokenValue = match[2]?.trim();
    if (!tokenName || !tokenValue) continue;
    rows.push({
      id: `${tokenName}-${rows.length}`,
      name: tokenName,
      value: tokenValue,
      type: inferTokenType(tokenName, tokenValue),
    });
  }

  const extraCss = rootMatch
    ? `${css.slice(0, rootMatch.index ?? 0)}${css.slice(
        (rootMatch.index ?? 0) + rootMatch[0].length,
      )}`.trim()
    : css.trim();

  return { rows, extraCss };
}

function serializeThemeCss(rows: ThemeTokenRow[], extraCss: string) {
  const uniqueRows = rows.filter(
    (row) => row.name.trim().length > 0 && row.value.trim().length > 0,
  );
  const declarations = uniqueRows
    .map((row) => `  --${row.name.trim()}: ${row.value.trim()};`)
    .join("\n");
  const rootBlock = `:root {\n${declarations}\n}`;
  return extraCss.trim().length > 0
    ? `${rootBlock}\n\n${extraCss.trim()}`
    : rootBlock;
}

function setNestedTokenValue(
  target: Record<string, unknown>,
  path: string[],
  value: { $value: string; $type?: string },
) {
  let cursor = target;
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      cursor[segment] = value;
      return;
    }

    if (
      !cursor[segment] ||
      typeof cursor[segment] !== "object" ||
      Array.isArray(cursor[segment])
    ) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  });
}

function toDesignTokensDocument(title: string, rows: ThemeTokenRow[]) {
  const tokens: Record<string, unknown> = {};
  const validRows = rows.filter(
    (row) => row.name.trim().length > 0 && row.value.trim().length > 0,
  );

  validRows.forEach((row) => {
    const path = row.name
      .trim()
      .split("-")
      .filter(Boolean);
    if (path.length === 0) return;

    setNestedTokenValue(tokens, path, {
      $value: row.value.trim(),
      ...(row.type !== "other" ? { $type: row.type } : {}),
    });
  });

  return {
    $schema: "https://www.designtokens.org/tr/drafts/format/",
    $description: `${title} exported from Cozy Registry`,
    tokens,
  };
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderTokenPreview(row: ThemeTokenRow) {
  switch (row.type) {
    case "color":
      return (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 shrink-0 rounded-md border border-zinc-200 shadow-inner dark:border-zinc-700"
            style={{ background: row.value }}
            aria-hidden="true"
          />
          <span className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
            {row.value}
          </span>
        </div>
      );
    case "fontFamily":
      return (
        <div className="truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          <span style={{ fontFamily: row.value }}>Ag Cozy</span>
        </div>
      );
    case "dimension":
      return (
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 min-w-8 rounded-full bg-zinc-400 dark:bg-zinc-500" />
          <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">
            {row.value}
          </span>
        </div>
      );
    case "number":
      return (
        <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {row.value}
        </span>
      );
    default:
      return (
        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {row.value}
        </span>
      );
  }
}

export function ThemeTokenEditor({
  owner,
  name,
  title,
  code,
  isOwner,
  canSave,
}: ThemeTokenEditorProps) {
  const [rows, setRows] = useState<ThemeTokenRow[]>([]);
  const [extraCss, setExtraCss] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [copiedExport, setCopiedExport] = useState<"css" | "tokens" | null>(
    null,
  );

  useEffect(() => {
    const parsed = parseThemeCss(code);
    setRows(parsed.rows.length > 0 ? parsed.rows : []);
    setExtraCss(parsed.extraCss);
    setStatus("idle");
    setError("");
  }, [code]);

  const serializedCss = useMemo(
    () => serializeThemeCss(rows, extraCss),
    [rows, extraCss],
  );
  const designTokensJson = useMemo(
    () => JSON.stringify(toDesignTokensDocument(title, rows), null, 2),
    [rows, title],
  );

  const hasRows = rows.length > 0;

  function updateRow(
    id: string,
    key: keyof ThemeTokenRow,
    value: string,
  ) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        if (key === "type") {
          return { ...row, type: value as TokenType };
        }
        return { ...row, [key]: value };
      }),
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: `new-${current.length}-${Date.now()}`,
        name: "",
        value: "",
        type: "other",
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  async function copyExport(kind: "css" | "tokens") {
    const content = kind === "css" ? serializedCss : designTokensJson;
    await navigator.clipboard.writeText(content);
    setCopiedExport(kind);
    setTimeout(() => setCopiedExport(null), 2000);
  }

  async function saveTheme() {
    if (!isOwner || !canSave) return;
    setStatus("saving");
    setError("");

    try {
      const response = await fetch(`/api/registry/${owner}/${name}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: serializedCss,
          bump: "patch",
          message: "Update theme tokens from table editor",
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Save failed");
      }

      setStatus("saved");
      window.location.href = `/registry/${owner}/${name}`;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Theme Tokens
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {isOwner
              ? "Edit tokens in the table and save a new patch version."
              : "This theme’s tokens are shown in a table for browsing and export."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyExport("css")}
          >
            {copiedExport === "css" ? "CSS copied" : "Copy CSS"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyExport("tokens")}
          >
            {copiedExport === "tokens" ? "Tokens copied" : "Copy Design Tokens"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadTextFile(`${name}.css`, serializedCss, "text/css")
            }
          >
            Download CSS
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadTextFile(
                `${name}.tokens.json`,
                designTokensJson,
                "application/json",
              )
            }
          >
            Download W3C tokens
          </Button>
          {isOwner && (
            <Button
              type="button"
              size="sm"
              onClick={saveTheme}
              disabled={!canSave || status === "saving"}
            >
              {status === "saving" ? "Saving…" : "Save as new version"}
            </Button>
          )}
        </div>
      </div>

      {!hasRows ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
          No CSS variables were found under <code>:root</code>. The raw theme still
          appears below; for table editing, use{" "}
          <code>:root {"{ --color-primary: ... }"}</code> style declarations.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]">Token</TableHead>
                <TableHead className="w-[28%]">Value</TableHead>
                <TableHead className="w-[16%]">Type</TableHead>
                <TableHead className="w-[20%]">Preview</TableHead>
                <TableHead className="w-[12%] text-right">
                  {isOwner ? "Actions" : "Notes"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    {isOwner ? (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          --
                        </span>
                        <input
                          value={row.name}
                          onChange={(event) =>
                            updateRow(row.id, "name", event.target.value)
                          }
                          className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </div>
                    ) : (
                      `--${row.name}`
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {isOwner ? (
                      <input
                        value={row.value}
                        onChange={(event) =>
                          updateRow(row.id, "value", event.target.value)
                        }
                        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    ) : (
                      row.value
                    )}
                  </TableCell>
                  <TableCell>
                    {isOwner ? (
                      <select
                        value={row.type}
                        onChange={(event) =>
                          updateRow(row.id, "type", event.target.value)
                        }
                        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <option value="color">color</option>
                        <option value="dimension">dimension</option>
                        <option value="number">number</option>
                        <option value="fontFamily">fontFamily</option>
                        <option value="other">other</option>
                      </select>
                    ) : (
                      <span className="rounded bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {row.type}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{renderTokenPreview(row)}</TableCell>
                  <TableCell className="text-right">
                    {isOwner ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(row.id)}
                      >
                        Remove
                      </Button>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        Export as CSS or tokens
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {isOwner && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            Add token
          </Button>
          {!canSave && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              You’re viewing an older version. Switch to the latest version to save edits.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Extra CSS
            </h3>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Outside :root
            </span>
          </div>
          {isOwner ? (
            <textarea
              value={extraCss}
              onChange={(event) => setExtraCss(event.target.value)}
              rows={8}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Optional: body, .dark, or other rules"
            />
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-zinc-700 dark:text-zinc-300">
              {extraCss || "No extra rules"}
            </pre>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Export preview
            </h3>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              DTCG / CSS
            </span>
          </div>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {designTokensJson}
          </pre>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      {status === "saved" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
          New theme version saved. Refreshing…
        </div>
      )}
    </section>
  );
}
