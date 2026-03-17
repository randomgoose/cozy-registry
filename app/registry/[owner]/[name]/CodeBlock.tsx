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
      try {
        const res = await fetch("/api/highlight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: text, language }),
        });
        if (!res.ok) throw new Error("Highlight request failed");
        const data = (await res.json()) as { html?: string };
        const html = typeof data.html === "string" ? data.html : "";
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
        className="overflow-x-auto rounded-lg border border-zinc-200 bg-[#0d1117] dark:border-zinc-800"
        style={
          hasManyLines && collapsed
            ? {
                maxHeight: `${LINES_TO_SHOW * LINE_HEIGHT_REM}rem`,
                overflow: "hidden",
              }
            : undefined
        }
      >
        {highlightedHtml ? (
          <div
            className="text-sm leading-relaxed [&_pre]:m-0 [&_pre]:p-4 [&_code]:font-mono"
            // shiki returns a full <pre class="shiki">...</pre>
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="p-4 text-sm leading-relaxed">
            <code className="font-mono" style={{ background: "transparent", padding: 0 }}>
              {safeCode}
            </code>
          </pre>
        )}
        {hasManyLines && collapsed && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-[#0d1117] to-transparent"
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
