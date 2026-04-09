"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Check, ChevronsUpDown, FolderKanban } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectListItem } from "@/lib/project-list";
import { cn } from "@/lib/utils";

function normalizePath(p: string) {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

function isProjectsIndexPath(pathname: string) {
  const p = normalizePath(pathname);
  if (p === "/me/projects") return true;
  return /^\/workspace\/[^/]+\/projects$/.test(p);
}

function projectHrefForId(params: {
  projectId: string;
  isWorkspaceShell: boolean;
  activeWorkspaceSlug?: string;
  section?: "detail" | "settings";
  settingsSection?: string | null;
}) {
  const suffix =
    params.section === "settings"
      ? `/settings/${params.settingsSection ?? "general"}`
      : "";
  if (params.isWorkspaceShell && params.activeWorkspaceSlug) {
    return `/workspace/${encodeURIComponent(params.activeWorkspaceSlug)}/projects/${params.projectId}${suffix}`;
  }
  return `/me/projects/${params.projectId}${suffix}`;
}

function projectsIndexHref(isWorkspaceShell: boolean, activeWorkspaceSlug?: string) {
  if (isWorkspaceShell && activeWorkspaceSlug) {
    return `/workspace/${encodeURIComponent(activeWorkspaceSlug)}/projects`;
  }
  return "/me/projects";
}

const menuItemClass =
  "rounded-xl px-3 py-2.5 text-sm text-zinc-700 focus:bg-black/[0.06] focus:text-zinc-950 dark:text-zinc-300 dark:focus:bg-black/30 dark:focus:text-zinc-50";

export function ProjectSwitcher(props: {
  pathname: string;
  projects: ProjectListItem[];
  selectedProjectId: string | null;
  isWorkspaceShell: boolean;
  activeWorkspaceSlug?: string;
  preserveSection?: "detail" | "settings";
  preserveSettingsSection?: string | null;
  className?: string;
}) {
  const {
    pathname,
    projects,
    selectedProjectId,
    isWorkspaceShell,
    activeWorkspaceSlug,
    preserveSection = "detail",
    preserveSettingsSection = null,
    className,
  } = props;

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const projectsListHref = projectsIndexHref(isWorkspaceShell, activeWorkspaceSlug);
  const onProjectsIndex = isProjectsIndexPath(pathname);
  const allProjectsActive = !selectedProjectId && onProjectsIndex;

  const triggerLabel = selectedProjectId
    ? (selectedProject?.title ?? "Project")
    : onProjectsIndex
      ? "All projects"
      : "Projects";

  return (
    <div className={cn(className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="px-2 py-1 cursor-pointer inline-flex min-w-0 items-center gap-1 rounded-xl text-left hover:bg-background-hover transition"
            />
          }
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl">
            <FolderKanban className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {triggerLabel}
            </div>
          </div>
          <ChevronsUpDown size={14}/>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={10}
          className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-white/60 bg-white/90 p-2 shadow-[0_20px_40px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90 dark:shadow-[0_24px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          <DropdownMenuItem
            className={menuItemClass}
            render={<Link href={projectsListHref} />}
          >
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <FolderKanban className="size-4" />
                </div>
                <span className="truncate font-medium">All projects</span>
              </div>
              {allProjectsActive ? <Check className="size-4 shrink-0" /> : null}
            </div>
          </DropdownMenuItem>

          {projects.length > 0 ? <DropdownMenuSeparator className="my-1 bg-zinc-200/80 dark:bg-zinc-800" /> : null}

          {projects.map((project) => {
            const href = projectHrefForId({
              projectId: project.id,
              isWorkspaceShell,
              activeWorkspaceSlug,
              section: preserveSection,
              settingsSection: preserveSettingsSection,
            });
            const active = project.id === selectedProjectId;
            return (
              <DropdownMenuItem
                key={project.id}
                className={menuItemClass}
                render={<Link href={href} />}
              >
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      <FolderKanban className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{project.title}</div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{project.slug}</div>
                    </div>
                  </div>
                  {active ? <Check className="size-4 shrink-0" /> : null}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
