"use client";

import { useMemo } from "react";
import { parseTokensFromJson } from "@/lib/theme-tokens";
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

export function ThemeTokensTable(props: { files: FileEntry[] }) {
  const tokensJsonFile = props.files.find((f) =>
    f.path.toLowerCase().endsWith(".json"),
  );

  const rows = useMemo(
    () =>
      tokensJsonFile
        ? parseTokensFromJson(tokensJsonFile.content).map<TokenRow>((token) => ({
            name: token.path.join(".") || "token",
            cssVar: `--${(token.path.length ? token.path : ["token"])
              .join("-")
              .replace(/[^a-zA-Z0-9-_]/g, "-")
              .replace(/--+/g, "-")
              .toLowerCase()}`,
            type: token.type,
            value: token.value,
          }))
        : [],
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
