import { useMemo, useState } from "react";

type CodeBlockLiteProps = {
  code: string;
  collapsedLines?: number;
};

export function CodeBlockLite({
  code,
  collapsedLines = 14,
}: CodeBlockLiteProps) {
  const [expanded, setExpanded] = useState(false);
  const safeCode = typeof code === "string" ? code : "";
  const lines = useMemo(() => safeCode.split("\n"), [safeCode]);
  const hasManyLines = lines.length > collapsedLines;
  const visibleCode = expanded || !hasManyLines
    ? safeCode
    : lines.slice(0, collapsedLines).join("\n");

  return (
    <div className="rounded-[24px] border border-zinc-200/80 bg-[#0d1117] shadow-[0_16px_36px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:shadow-[0_20px_44px_rgba(0,0,0,0.28)]">
      <pre className="overflow-x-auto p-4 text-sm leading-7 text-zinc-100">
        <code>{visibleCode}</code>
      </pre>
      {hasManyLines ? (
        <div className="border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="text-sm font-medium text-zinc-300 transition hover:text-zinc-100"
          >
            {expanded ? "Collapse code" : `Expand code (${lines.length} lines)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
