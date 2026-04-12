"use client";

import { useRef } from "react";
import { ArtboardToolIcon, Trash, Trash2 } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Folder from "@/components/Folder";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  getProjectFolderColor,
  getProjectItemTypeIcon,
  getProjectPreviewSlotPlaceholderClass,
} from "./helpers";
import type { Project } from "./types";

export function ProjectsPortfolioGrid(props: {
  projects: Project[];
  projectsBasePath?: string;
  isOrgScope?: boolean;
  expandedProjectCardId: string | null;
  onExpandedProjectCardIdChange: (id: string | null) => void;
  router: { push: (href: string) => void };
  onMoveProjectToTrash?: (project: Project) => void;
}) {
  const suppressNextCardClickRef = useRef<string | null>(null);
  const emptyLabel = props.isOrgScope
    ? "No organization projects yet."
    : "No projects yet.";

  if (props.projects.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      onClick={() => props.onExpandedProjectCardIdChange(null)}
    >
      {props.projects.map((c) => {
        const runMenuAction = (action: () => void) => {
          suppressNextCardClickRef.current = c.id;
          action();
        };
        const href = props.projectsBasePath ? `${props.projectsBasePath}/${c.id}` : undefined;
        const settingsHref = href ? `${href}/settings/general` : undefined;
        const previews = c.previewItems ?? [];
        const total = c.itemCount ?? 0;
        const extra = total > 4 ? total - 4 : 0;
        const isExpanded = props.expandedProjectCardId === c.id;
        const cardClass = `group bg-secondary/50 rounded-[28px] border p-3 text-left transition ${isExpanded
          ? "border-violet-300 bg-violet-50/50 shadow-[0_0_0_1px_rgba(139,92,246,0.08)] dark:border-violet-500/50 dark:bg-violet-500/10"
          : "border-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
          }`;

        const inner = (
          <>
            <div className="flex min-h-[220px] items-center justify-center rounded-[32px] bg-radial-[circle_at_top,#ffffff,transparent_62%] from-white via-transparent to-transparent px-4 py-6 dark:bg-radial-[circle_at_top,rgba(255,255,255,0.06),transparent_62%]">
              <Folder
                interactive={false}
                open={isExpanded}
                shellOpen
                color={getProjectFolderColor(c.visibility)}
                size={1.72}
                className="origin-center transition duration-300 group-hover:scale-[1.03]"
                items={previews.slice(0, 3).map((it, i) => {
                  const typeIcon = getProjectItemTypeIcon(it.type);
                  const placeholderClass = getProjectPreviewSlotPlaceholderClass(it.type);
                  return (
                    <div
                      key={`${c.id}-folder-item-${i}`}
                      className="size-full"
                    >
                      {it.thumbnailUrl ? (
                        <div className="relative size-full overflow-hidden rounded-[10px] bg-white/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-zinc-950/50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={it.thumbnailUrl}
                            alt=""
                            className="absolute inset-1 size-[calc(100%-0.5rem)] object-contain"
                          />
                        </div>
                      ) : (
                        <div
                          className={`flex size-full items-center justify-center ${placeholderClass}`}
                          aria-hidden="true"
                        >
                          <HugeiconsIcon
                            icon={typeIcon.icon ?? ArtboardToolIcon}
                            size={18}
                            strokeWidth={1.8}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              />
            </div>
            <div className="mt-2 flex items-start justify-between gap-3 px-1">
              <div className="min-w-0">
                <span className="block truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {c.title}
                </span>
                <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono">{c.slug}</span>
                  {extra > 0 ? (
                    <span className="ml-2 font-sans text-zinc-400 dark:text-zinc-500">
                      +{extra} more
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="mt-0.5 shrink-0 rounded-full border border-zinc-200/80 bg-white/80 px-2 py-1 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                {c.visibility === "private" ? "Private" : "Public"}
              </span>
            </div>
          </>
        );

        return (
          <ContextMenu
            key={c.id}
            onOpenChange={(open) => {
              if (open) props.onExpandedProjectCardIdChange(c.id);
            }}
          >
            <ContextMenuTrigger>
              {href ? (
                <button
                  type="button"
                  className={cardClass}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressNextCardClickRef.current === c.id) {
                      suppressNextCardClickRef.current = null;
                      return;
                    }
                    if (props.expandedProjectCardId !== c.id) {
                      props.onExpandedProjectCardIdChange(c.id);
                      return;
                    }
                    props.router.push(href);
                  }}
                >
                  {inner}
                </button>
              ) : (
                <div
                  className={cardClass}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressNextCardClickRef.current === c.id) {
                      suppressNextCardClickRef.current = null;
                      return;
                    }
                    props.onExpandedProjectCardIdChange(c.id);
                  }}
                >
                  {inner}
                </div>
              )}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
              {href ? (
                <ContextMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    runMenuAction(() => props.router.push(href));
                  }}
                >
                  Open project
                </ContextMenuItem>
              ) : null}
              {settingsHref ? (
                <ContextMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    runMenuAction(() => props.router.push(settingsHref));
                  }}
                >
                  Project settings
                </ContextMenuItem>
              ) : null}
              {props.onMoveProjectToTrash ? (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      runMenuAction(() => props.onMoveProjectToTrash?.(c));
                    }}
                  >
                    <HugeiconsIcon icon={Trash} size={16}/>
                    Move to trash
                  </ContextMenuItem>
                </>
              ) : null}
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
