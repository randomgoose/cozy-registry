"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type RegistryFileEntry = { path: string; type: string };

type DirMap = { dirs: Map<string, DirMap>; files: RegistryFileEntry[] };

function insertPath(root: DirMap, file: RegistryFileEntry) {
  const parts = file.path.split("/").filter(Boolean);
  if (parts.length === 0) return;
  parts.pop(); // basename handled by resting at cur
  let cur = root;
  for (const seg of parts) {
    if (!cur.dirs.has(seg)) {
      cur.dirs.set(seg, { dirs: new Map(), files: [] });
    }
    cur = cur.dirs.get(seg)!;
  }
  cur.files.push(file);
}

type TreeNode =
  | {
      kind: "dir";
      name: string;
      pathPrefix: string;
      children: TreeNode[];
    }
  | { kind: "file"; name: string; entry: RegistryFileEntry };

function toTreeNodes(d: DirMap, prefix: string): TreeNode[] {
  const nodes: TreeNode[] = [];
  const dirKeys = [...d.dirs.keys()].sort((a, b) => a.localeCompare(b));
  for (const seg of dirKeys) {
    const sub = d.dirs.get(seg)!;
    const pathPrefix = prefix ? `${prefix}/${seg}` : seg;
    nodes.push({
      kind: "dir",
      name: seg,
      pathPrefix,
      children: toTreeNodes(sub, pathPrefix),
    });
  }
  const sortedFiles = d.files.slice().sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sortedFiles) {
    nodes.push({
      kind: "file",
      name: f.path.includes("/") ? f.path.slice(f.path.lastIndexOf("/") + 1) : f.path,
      entry: f,
    });
  }
  return nodes;
}

function buildTree(files: RegistryFileEntry[]): TreeNode[] {
  const root: DirMap = { dirs: new Map(), files: [] };
  for (const f of files) {
    insertPath(root, f);
  }
  return toTreeNodes(root, "");
}

function ancestorPrefixes(filePath: string): string[] {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) return [];
  parts.pop();
  const out: string[] = [];
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    out.push(acc);
  }
  return out;
}

function FileTreeNodes(props: {
  nodes: TreeNode[];
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleDir: (pathPrefix: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const { nodes, selectedPath, expanded, onToggleDir, onSelectFile } = props;

  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "dir") {
          const isOpen = expanded.has(node.pathPrefix);
          const hasContent = node.children.length > 0;
          return (
            <li key={node.pathPrefix} className="list-none">
              <button
                type="button"
                role="treeitem"
                aria-selected={false}
                aria-expanded={hasContent ? isOpen : undefined}
                className="flex w-full min-h-8 items-center gap-0.5 rounded-md px-1 py-0.5 text-left text-[11px] text-zinc-700 transition-colors hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                onClick={() => onToggleDir(node.pathPrefix)}
              >
                <span className="flex size-5 shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400">
                  {hasContent ? (
                    isOpen ? (
                      <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
                    ) : (
                      <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden />
                    )
                  ) : (
                    <span className="size-3.5" aria-hidden />
                  )}
                </span>
                <span className="truncate font-medium">{node.name}</span>
              </button>
              {isOpen && hasContent ? (
                <ul
                  className="ml-0.5 mt-0.5 space-y-0.5 border-l border-zinc-200/80 py-0.5 pl-1.5 dark:border-zinc-700/80"
                  role="group"
                >
                  <FileTreeNodes
                    nodes={node.children}
                    selectedPath={selectedPath}
                    expanded={expanded}
                    onToggleDir={onToggleDir}
                    onSelectFile={onSelectFile}
                  />
                </ul>
              ) : null}
            </li>
          );
        }

        const selected = node.entry.path === selectedPath;
        return (
          <li key={node.entry.path} className="list-none">
            <button
              type="button"
              role="treeitem"
              aria-selected={selected}
              onClick={() => onSelectFile(node.entry.path)}
              className={cn(
                "flex w-full flex-col rounded-md px-1 py-1 text-left transition",
                selected
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                  : "text-zinc-600 hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80",
              )}
            >
              <span className="truncate font-mono text-[11px] leading-snug">{node.name}</span>
              <span
                className={cn(
                  "mt-0.5 truncate text-[10px] leading-tight",
                  selected
                    ? "text-white/70 dark:text-zinc-600"
                    : "text-zinc-400 dark:text-zinc-500",
                )}
              >
                {node.entry.type.replace("registry:", "")}
              </span>
            </button>
          </li>
        );
      })}
    </>
  );
}

export function RegistryFileTree(props: {
  files: RegistryFileEntry[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const { files, selectedPath, onSelectFile } = props;

  const tree = useMemo(() => buildTree(files), [files]);

  const [userExpanded, setUserExpanded] = useState<Set<string>>(() => new Set());

  const expanded = useMemo(() => {
    const s = new Set(userExpanded);
    if (selectedPath) {
      for (const p of ancestorPrefixes(selectedPath)) {
        s.add(p);
      }
    }
    return s;
  }, [userExpanded, selectedPath]);

  const onToggleDir = useCallback((pathPrefix: string) => {
    setUserExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathPrefix)) next.delete(pathPrefix);
      else next.add(pathPrefix);
      return next;
    });
  }, []);

  if (tree.length === 0) {
    return (
      <p className="px-1.5 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">没有可显示的文件</p>
    );
  }

  return (
    <nav className="text-[11px]" aria-label="组件文件">
      <ul className="space-y-0.5" role="tree">
        <FileTreeNodes
          nodes={tree}
          selectedPath={selectedPath}
          expanded={expanded}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
        />
      </ul>
    </nav>
  );
}
