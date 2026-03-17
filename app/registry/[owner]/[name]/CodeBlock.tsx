"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const LINES_TO_SHOW = 14;
const LINE_HEIGHT_REM = 1.625;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function CodeBlock({
  code,
  language = "tsx",
}: {
  code: string;
  language?: string;
}) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [collapsed, setCollapsed] = useState(true);

  const safeCode = typeof code === "string" ? code : "";
  const lines = safeCode.split("\n");
  const hasManyLines = lines.length > LINES_TO_SHOW;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const text = typeof code === "string" ? code : "";
    let cancelled = false;

    void (async () => {
      const prismMod = await import("prismjs");
      const Prism = prismMod.default ?? prismMod;
      if (language === "css") {
        // @ts-expect-error prism-css has no types in @types/prismjs
        await import("prismjs/components/prism-css");
      } else {
        await import("prismjs/components/prism-tsx");
      }
      if (cancelled) return;

      const langs = Prism.languages;
      if (!langs) {
        setHighlightedHtml(escapeHtml(text));
        return;
      }
      const grammar = langs[language] ?? langs.plaintext ?? langs.plain;
      if (!grammar) {
        setHighlightedHtml(escapeHtml(text));
        return;
      }
      try {
        const html = Prism.highlight(text, grammar, language);
        if (!cancelled) setHighlightedHtml(html);
      } catch {
        if (!cancelled) setHighlightedHtml(escapeHtml(text));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className="relative">
      <div
        className="overflow-x-auto rounded-lg border border-zinc-200 bg-[#1d1f21] dark:border-zinc-800"
        style={
          hasManyLines && collapsed
            ? {
                maxHeight: `${LINES_TO_SHOW * LINE_HEIGHT_REM}rem`,
                overflow: "hidden",
              }
            : undefined
        }
      >
        <pre className="p-4 text-sm leading-relaxed">
          {highlightedHtml ? (
            <code
              className={`language-${language} font-mono`}
              style={{ background: "transparent", padding: 0 }}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <code
              className={`language-${language} font-mono`}
              style={{ background: "transparent", padding: 0 }}
            >
              {safeCode}
            </code>
          )}
        </pre>
        {hasManyLines && collapsed && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-[#1d1f21] to-transparent"
            aria-hidden
          />
        )}
      </div>
      {hasManyLines && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <>
              <span>展开</span>
              <span className="text-zinc-400">({lines.length} 行)</span>
            </>
          ) : (
            "收起"
          )}
        </Button>
      )}
    </div>
  );
}
