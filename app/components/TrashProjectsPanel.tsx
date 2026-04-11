"use client";

import { useState } from "react";
import { Clock3, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectListItem } from "@/lib/project-list";
import { PageContentShell } from "./PageContentShell";

type TrashProjectsPanelProps = {
  initialProjects: ProjectListItem[];
  heading: string;
  description: string;
};

function formatArchivedAt(value: Date | string | null | undefined) {
  if (!value) return "Recently";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function TrashProjectsPanel(props: TrashProjectsPanelProps) {
  const [projects, setProjects] = useState(props.initialProjects);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore(projectId: string) {
    setPendingProjectId(projectId);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to restore project");
      }
      setProjects((current) => current.filter((project) => project.id !== projectId));
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore project");
    } finally {
      setPendingProjectId(null);
    }
  }

  return (
    <PageContentShell size="wide" className="space-y-6">
      <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Trash</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {props.heading}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              {props.description}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
            {projects.length} archived project{projects.length === 1 ? "" : "s"}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {projects.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white/70 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-xl">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
              <Trash2 className="size-5" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Trash is empty
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Archived projects will show up here. Once restore is available for an item, you can send it
              back to your active project list in one click.
            </p>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const restoring = pendingProjectId === project.id;
            return (
              <section
                key={project.id}
                className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                        {project.title}
                      </h2>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                        {project.visibility === "private" ? "Private" : "Public"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      <span className="font-mono">{project.slug}</span>
                      <span className="mx-2">·</span>
                      <span className="font-mono">{project.namespaceKey}</span>
                    </p>
                    {project.description ? (
                      <p className="mt-3 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
                        {project.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="size-3.5" />
                        Archived {formatArchivedAt(project.archivedAt)}
                      </span>
                      <span>{project.itemCount} resources</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => void handleRestore(project.id)}
                      disabled={restoring}
                    >
                      <RotateCcw className="size-4" />
                      {restoring ? "Restoring..." : "Restore"}
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageContentShell>
  );
}
