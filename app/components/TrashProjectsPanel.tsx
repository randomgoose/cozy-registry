"use client";

import { useState } from "react";
import { Clock3, RotateCcw, Trash2, FolderKanban, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectListItem } from "@/lib/project-list";
import type { TrashResourceListItem } from "@/lib/trash-resources";
import { PageContentShell } from "./PageContentShell";

type TrashProjectsPanelProps = {
  initialProjects: ProjectListItem[];
  initialResources: TrashResourceListItem[];
  /** Owner segment for `/api/registry/[owner]/[name]` (user handle or org slug). */
  registryApiOwner: string;
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
  const [resources, setResources] = useState(props.initialResources);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [pendingProjectPermanentId, setPendingProjectPermanentId] = useState<string | null>(null);
  const [pendingResource, setPendingResource] = useState<
    { mode: "restore" | "permanent"; key: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRestoreProject(projectId: string) {
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
      setError(null);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore project");
    } finally {
      setPendingProjectId(null);
    }
  }

  async function handlePermanentDeleteProject(projectId: string, title: string) {
    const ok = window.confirm(
      `确定永久删除项目「${title}」？此操作不可撤销。注册表中的资源仍会保留，但不再与此项目关联。`,
    );
    if (!ok) return;

    setPendingProjectPermanentId(projectId);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/permanent-delete`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to delete project");
      }
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setError(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete project permanently",
      );
    } finally {
      setPendingProjectPermanentId(null);
    }
  }

  function resourcePendingKey(projectId: string, itemId: string) {
    return `${projectId}:${itemId}`;
  }

  async function handleRestoreResource(projectId: string, itemId: string) {
    const key = resourcePendingKey(projectId, itemId);
    setPendingResource({ mode: "restore", key });
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/items/${itemId}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to restore resource");
      }
      setResources((current) => current.filter((r) => r.id !== itemId));
      setError(null);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore resource");
    } finally {
      setPendingResource(null);
    }
  }

  async function handlePermanentDeleteResource(
    item: TrashResourceListItem,
    projectKey: string,
  ) {
    const ok = window.confirm(
      `确定永久删除资源「${item.title}」（${item.name}）？将删除所有版本且不可恢复。`,
    );
    if (!ok) return;

    if (!item.canonicalProjectId) return;
    const key = resourcePendingKey(item.canonicalProjectId, item.id);
    setPendingResource({ mode: "permanent", key });
    setError(null);
    try {
      const owner = encodeURIComponent(props.registryApiOwner);
      const name = encodeURIComponent(item.name);
      const project = encodeURIComponent(projectKey);
      const response = await fetch(
        `/api/registry/${owner}/${name}?project=${project}&permanent=true`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to permanently delete resource");
      }
      setResources((current) => current.filter((r) => r.id !== item.id));
      setError(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to permanently delete resource",
      );
    } finally {
      setPendingResource(null);
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
            {projects.length} project{projects.length === 1 ? "" : "s"} · {resources.length} resource
            {resources.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-6">
          <Tabs defaultValue="projects" className="gap-4">
            <TabsList>
              <TabsTrigger value="projects" className="gap-1.5">
                <FolderKanban className="size-3.5" />
                Projects
              </TabsTrigger>
              <TabsTrigger value="resources" className="gap-1.5">
                <Package className="size-3.5" />
                Resources
              </TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="mt-0">
              {error ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
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
                      No archived projects
                    </h2>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      Archived projects appear here. Restore sends them back to your active list, or
                      delete permanently to remove the project record (registry resources remain).
                    </p>
                  </div>
                </section>
              ) : (
                <div className="space-y-4">
                  {projects.map((project) => {
                    const restoring = pendingProjectId === project.id;
                    const purging = pendingProjectPermanentId === project.id;
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
                              onClick={() => void handleRestoreProject(project.id)}
                              disabled={restoring || purging}
                            >
                              <RotateCcw className="size-4" />
                              {restoring ? "Restoring..." : "Restore"}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="lg"
                              aria-label="Permanently delete project"
                              onClick={() => void handlePermanentDeleteProject(project.id, project.title)}
                              disabled={restoring || purging}
                            >
                              <Trash2 className="size-4" />
                              {purging ? "删除中…" : "永久删除"}
                            </Button>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="resources" className="mt-0">
              {error ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  {error}
                </div>
              ) : null}

              {resources.length === 0 ? (
                <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white/70 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
                  <div className="mx-auto max-w-xl">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                      <Package className="size-5" />
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                      No archived resources
                    </h2>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      Resources removed from a project appear here. Restore returns them to the
                      project, or delete permanently to wipe all versions.
                    </p>
                  </div>
                </section>
              ) : (
                <div className="space-y-4">
                  {resources.map((item) => {
                    const projectKey = item.canonicalProjectKey ?? "";
                    const projectId = item.canonicalProjectId ?? "";
                    const busyKey = resourcePendingKey(projectId, item.id);
                    const restoringResource =
                      pendingResource?.mode === "restore" && pendingResource.key === busyKey;
                    const deletingResource =
                      pendingResource?.mode === "permanent" && pendingResource.key === busyKey;
                    const resourceBusy = restoringResource || deletingResource;
                    const canRestore = Boolean(projectId);
                    const canPermanent = Boolean(projectKey) && Boolean(props.registryApiOwner);

                    return (
                      <section
                        key={item.id}
                        className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                                {item.title}
                              </h2>
                              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                                {item.visibility === "private" ? "Private" : "Public"}
                              </span>
                            </div>
                            <p className="mt-1 font-mono text-sm text-zinc-500 dark:text-zinc-400">
                              {item.name}
                              <span className="mx-2 font-sans text-zinc-400">·</span>
                              <span>{item.type}</span>
                            </p>
                            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                              Project:{" "}
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                {item.projectTitle ?? item.projectSlug ?? "—"}
                              </span>
                              {item.projectSlug ? (
                                <span className="ml-1 font-mono text-zinc-500">({item.projectSlug})</span>
                              ) : null}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock3 className="size-3.5" />
                                Archived {formatArchivedAt(item.archivedAt)}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              disabled={!canRestore || resourceBusy}
                              onClick={() => void handleRestoreResource(projectId, item.id)}
                            >
                              <RotateCcw className="size-4" />
                              {restoringResource ? "Restoring..." : "Restore"}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="lg"
                              aria-label="Permanently delete resource"
                              disabled={!canPermanent || resourceBusy}
                              onClick={() => void handlePermanentDeleteResource(item, projectKey)}
                            >
                              <Trash2 className="size-4" />
                              {deletingResource ? "删除中…" : "永久删除"}
                            </Button>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </PageContentShell>
  );
}
