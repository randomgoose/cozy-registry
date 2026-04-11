"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageContentShell } from "@/app/components/PageContentShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ProjectSettingsPanelProps = {
  projectId: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: "public" | "private";
  namespaceKey: string;
  defaultThemeResourceRefs: string[];
  canEditProject: boolean;
  canDeleteProject: boolean;
  projectsBasePath: string;
  scopeLabel?: string;
  isOrgScope?: boolean;
  initialSection?: string | null;
};

function formatThemeRefsInput(value: string[]) {
  return value.join("\n");
}

function parseThemeRefsInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

export function ProjectSettingsPanel(props: ProjectSettingsPanelProps) {
  const router = useRouter();
  const [title, setTitle] = useState(props.title);
  const [slug, setSlug] = useState(props.slug);
  const [description, setDescription] = useState(props.description ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(props.visibility);
  const [themeRefsInput, setThemeRefsInput] = useState(
    formatThemeRefsInput(props.defaultThemeResourceRefs),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const activeSection =
    props.initialSection === "themes"
      ? "themes"
      : props.initialSection === "danger"
        ? "danger"
        : "general";

  const dirty = useMemo(
    () =>
      title !== props.title ||
      slug !== props.slug ||
      description !== (props.description ?? "") ||
      visibility !== props.visibility ||
      themeRefsInput !== formatThemeRefsInput(props.defaultThemeResourceRefs),
    [
      description,
      props.defaultThemeResourceRefs,
      props.description,
      props.slug,
      props.title,
      props.visibility,
      slug,
      themeRefsInput,
      title,
      visibility,
    ],
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!props.canEditProject || saving) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch(`/api/projects/${props.projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          visibility,
          defaultThemeResourceRefs: parseThemeRefsInput(themeRefsInput),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!props.canDeleteProject || deleting) return;
    const confirmed = window.confirm(
      "Delete this project? Resources will stay in the registry, but the project and its links will be removed.",
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${props.projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Delete failed (${res.status})`);
      }
      router.push(props.projectsBasePath);
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to delete project");
      setDeleting(false);
    }
  }

  return (
    <PageContentShell>
      <section className="space-y-6">
        <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Project settings
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {props.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Manage how this project appears inside {props.scopeLabel ?? "this workspace"}.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Visibility
              </p>
              <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {props.visibility}
              </p>
            </div>
            <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                URL slug
              </p>
              <p className="mt-2 font-mono text-sm text-zinc-950 dark:text-zinc-50">{props.slug}</p>
            </div>
            <div className="rounded-2xl bg-zinc-50/90 px-4 py-4 ring-1 ring-zinc-200/80 dark:bg-zinc-950/70 dark:ring-zinc-800">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Namespace
              </p>
              <p className="mt-2 font-mono text-sm text-zinc-950 dark:text-zinc-50">
                {props.namespaceKey}
              </p>
            </div>
          </div>
        </div>

        {activeSection === "general" || activeSection === "themes" ? (
        <form
          id="general"
          onSubmit={handleSave}
          className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">General</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Update the project label, routing slug, visibility, and default theme layers.
              </p>
            </div>
            {savedAt ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved at {savedAt}</span>
            ) : null}
          </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Project name
            </span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!props.canEditProject || saving}
              className="h-10 rounded-xl text-sm md:text-sm"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Slug
            </span>
            <Input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={!props.canEditProject || saving}
              className="h-10 rounded-xl font-mono text-sm md:text-sm"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Description
            </span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!props.canEditProject || saving}
              rows={3}
              className="rounded-xl text-sm md:text-sm"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Visibility
            </span>
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value === "public" ? "public" : "private")
              }
              disabled={!props.canEditProject || saving}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>

          <label id="themes" className="space-y-2 md:col-span-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Default theme resource refs
            </span>
            <Textarea
              value={themeRefsInput}
              onChange={(event) => setThemeRefsInput(event.target.value)}
              disabled={!props.canEditProject || saving}
              rows={4}
              placeholder="@org/theme"
              className="rounded-xl font-mono text-sm md:text-sm"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              One registry ref per line. These theme layers apply to project previews by default.
            </p>
          </label>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {props.canEditProject
              ? "Editors and above can update these settings."
              : "You can view project settings, but only editors and above can change them."}
          </div>
          <button
            type="submit"
            disabled={!props.canEditProject || saving || !dirty}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
        </form>
        ) : null}

        {activeSection === "danger" ? (
        <section
          id="danger"
          className="rounded-[28px] border border-red-200/80 bg-red-50/70 p-6 dark:border-red-900/50 dark:bg-red-950/20"
        >
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">Danger zone</h2>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            Deleting a project removes its member links and resource associations, but does not delete the registry resources themselves.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-red-700/80 dark:text-red-300/80">
              {props.canDeleteProject
                ? "Owners and admins can delete this project."
                : props.isOrgScope
                  ? "Only owners and admins can delete this project."
                  : "Only the project owner can delete this project."}
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!props.canDeleteProject || deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-400"
            >
              {deleting ? "Deleting..." : "Delete project"}
            </button>
          </div>
        </section>
        ) : null}
      </section>
    </PageContentShell>
  );
}
