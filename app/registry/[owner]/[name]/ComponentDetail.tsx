"use client";

import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CodeBlock } from "./CodeBlock";
import { ThemeTokenEditor } from "./ThemeTokenEditor";
import { Button } from "@/components/ui/button";
import { PreviewFrame } from "@/app/components/PreviewFrame";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PreviewStory } from "@/lib/preview-stories";
import {
  buildMultiStoryPreviewPageUrl,
  buildStoryPreviewArtifactStatusQuery,
  buildStoryPreviewPageUrl,
} from "@/lib/story-preview-urls";
import type { PropField } from "@/lib/validate-tsx";
import {
  getDependencyDisplayName,
  type DependencyDecision,
} from "@/lib/dependency-diagnostics";
import { ThemeTokensTable } from "./ThemeTokensTable";

interface VersionInfo {
  version: string;
  createdAt: Date;
  createdBy: string | null;
}

type PreviewArtifactStatus =
  | "missing"
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "skipped";
type PreviewArtifactCapability =
  | "managed-artifact"
  | "compatible-artifact"
  | "runtime-only";

type PreviewArtifactStatusPayload = {
  artifactStatus: PreviewArtifactStatus;
  artifactCapability?: PreviewArtifactCapability | null;
  compatibleExternalDependencies?: string[];
  resolvedThemeResourceRef?: string | null;
  resolvedThemeSource?: "resource-override" | "project-default" | "none" | null;
  lastError?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

function resolveSelectedPreviewStoryId(input: {
  currentStoryId: string | null;
  stories: Array<{ id: string }>;
  defaultStoryId: string | null;
}) {
  const normalizedCurrent = input.currentStoryId?.trim() || null;
  const normalizedDefault = input.defaultStoryId?.trim() || null;
  const availableStoryIds = new Set(
    input.stories.map((story) => story.id.trim()).filter(Boolean),
  );

  if (normalizedCurrent && availableStoryIds.has(normalizedCurrent)) {
    return normalizedCurrent;
  }
  if (normalizedDefault && availableStoryIds.has(normalizedDefault)) {
    return normalizedDefault;
  }
  return input.stories[0]?.id ?? null;
}

interface ComponentDetailProps {
  owner: string;
  project?: string | null;
  name: string;
  title: string;
  description: string | null;
  type: string;
  visibility: "public" | "private";
  code: string;
  /** Full install URL (e.g. https://xxx.vercel.app/api/r/owner/name) for shadcn add; if unset, UI shows a path placeholder */
  installUrl: string | null;
  /** Latest published version */
  currentVersion: string;
  /** Selected version (for display and install command) */
  selectedVersion: string;
  /** All versions (incl. current) for the version selector */
  versions: VersionInfo[];
  /** Whether the signed-in user owns this item */
  isOwner: boolean;
  /** npm deps (e.g. react, clsx) */
  dependencies: string[];
  dependencyDiagnostics: DependencyDecision[];
  /** In-registry deps (e.g. @owner/other-component) */
  registryDependencies: string[];
  /** Props parsed from TSX */
  propsFromCode: PropField[];
  previewStories: PreviewStory[];
  defaultPreviewStoryId: string | null;
  requestedPreviewStoryId: string | null;
  /** All files in the current version bundle */
  files: { path: string; content: string; type: string }[];
}

export function ComponentDetail({
  owner,
  project,
  name,
  title,
  description,
  type,
  visibility,
  code,
  installUrl,
  currentVersion,
  selectedVersion,
  versions,
  isOwner,
  dependencies,
  dependencyDiagnostics,
  registryDependencies,
  propsFromCode,
  previewStories,
  defaultPreviewStoryId,
  requestedPreviewStoryId,
  files,
}: ComponentDetailProps) {
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [localVisibility, setLocalVisibility] = useState<"public" | "private">(
    visibility,
  );
  const [localSelectedVersion, setLocalSelectedVersion] =
    useState(selectedVersion);
  const [artifactStatus, setArtifactStatus] =
    useState<PreviewArtifactStatusPayload | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(
    resolveSelectedPreviewStoryId({
      currentStoryId: requestedPreviewStoryId,
      stories: previewStories,
      defaultStoryId: defaultPreviewStoryId,
    }),
  );
  const router = useRouter();

  // Keep selector in sync when route search params change
  useEffect(() => {
    setLocalSelectedVersion(selectedVersion);
  }, [selectedVersion]);

  useEffect(() => {
    setLocalVisibility(visibility);
  }, [visibility]);

  useEffect(() => {
    setSelectedStoryId(
      resolveSelectedPreviewStoryId({
        currentStoryId: requestedPreviewStoryId,
        stories: previewStories,
        defaultStoryId: defaultPreviewStoryId,
      }),
    );
  }, [defaultPreviewStoryId, previewStories, requestedPreviewStoryId]);

  const [previewReady, setPreviewReady] = useState(type === "registry:theme");

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadArtifactStatus() {
      try {
        const search = buildStoryPreviewArtifactStatusQuery({
          owner,
          name,
          version: localSelectedVersion,
          project,
          storyId: selectedStoryId,
          enqueue: true,
        });
        const res = await fetch(
          `/api/registry/preview-artifacts/status?${search.toString()}`,
        );
        if (!res.ok) {
          if (!cancelled) {
            setArtifactStatus(null);
            setPreviewReady(true);
          }
          return;
        }
        const data = (await res.json()) as PreviewArtifactStatusPayload;
        if (cancelled) return;
        setArtifactStatus(data);

        const st = data.artifactStatus;
        if (st === "queued" || st === "running") {
          setPreviewReady(false);
          pollTimer = setTimeout(loadArtifactStatus, 3000);
        } else {
          setPreviewReady(true);
        }
      } catch {
        if (!cancelled) {
          setArtifactStatus(null);
          setPreviewReady(true);
        }
      }
    }

    if (type === "registry:theme") {
      setPreviewReady(true);
    } else {
      setPreviewReady(false);
      loadArtifactStatus();
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [owner, project, name, localSelectedVersion, selectedStoryId, type]);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const baseInstallUrl =
    installUrl ?? `https://your-registry-domain/api/r/${owner}/${name}`;
  const installUrlWithVersion =
    localSelectedVersion && localSelectedVersion !== currentVersion
      ? `${baseInstallUrl}?v=${encodeURIComponent(localSelectedVersion)}`
      : baseInstallUrl;
  const shadcnCommand = `npx shadcn@latest add ${installUrlWithVersion}`;

  async function handleCopyCommand() {
    await navigator.clipboard.writeText(shadcnCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  }

  const typeLabel =
    type === "registry:theme"
      ? "Theme"
      : type.replace("registry:", "") === "block"
        ? "Block"
        : "Component";
  const previewHref = buildStoryPreviewPageUrl({
    owner,
    name,
    project,
    version:
      localSelectedVersion && localSelectedVersion !== currentVersion
        ? localSelectedVersion
        : null,
    storyId: selectedStoryId,
  });
  const storiesPreviewHref = buildMultiStoryPreviewPageUrl({
    owner,
    name,
    project,
    version:
      localSelectedVersion && localSelectedVersion !== currentVersion
        ? localSelectedVersion
        : null,
    storyId: selectedStoryId,
  });
  const isTheme = type === "registry:theme";
  const canEditTheme =
    isTheme && isOwner && localSelectedVersion === currentVersion;
  const artifactStatusTone = (() => {
    switch (artifactStatus?.artifactStatus) {
      case "ready":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
      case "skipped":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
      case "queued":
      case "running":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
      default:
        return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    }
  })();
  const artifactStatusLabel = (() => {
    switch (artifactStatus?.artifactStatus) {
      case "queued":
        return "Artifact queued";
      case "running":
        return "Artifact building";
      case "ready":
        return artifactStatus.artifactCapability === "compatible-artifact"
          ? "Compatibility mode"
          : "Artifact ready";
      case "failed":
        return "Artifact failed";
      case "skipped":
        return "Runtime preview only";
      case "missing":
        return "Artifact missing";
      default:
        return null;
    }
  })();
  const artifactStatusMessage =
    artifactStatus?.artifactStatus === "ready" &&
    artifactStatus.artifactCapability === "compatible-artifact"
      ? artifactStatus.compatibleExternalDependencies?.length
        ? `Some dependencies load at runtime: ${artifactStatus.compatibleExternalDependencies.join(", ")}.`
        : "Some dependencies load at runtime."
      : artifactStatus?.artifactStatus === "skipped"
      ? artifactStatus.lastError?.message ??
        "Preview artifact prebundle was skipped by policy."
      : artifactStatus?.artifactStatus === "failed"
        ? artifactStatus.lastError?.message ?? "Preview artifact build failed."
        : null;
  const resolvedThemeLabel = artifactStatus?.resolvedThemeResourceRef
    ? artifactStatus.resolvedThemeSource === "resource-override"
      ? `Theme override: ${artifactStatus.resolvedThemeResourceRef}`
      : `Project theme: ${artifactStatus.resolvedThemeResourceRef}`
    : artifactStatus?.resolvedThemeSource === "none"
      ? "No resolved theme"
      : null;

  function handleVersionChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setLocalSelectedVersion(v);
    const search = new URLSearchParams();
    if (project?.trim()) {
      search.set("project", project.trim());
    }
    if (v !== currentVersion) {
      search.set("v", v);
    }
    if (selectedStoryId?.trim()) {
      search.set("story", selectedStoryId.trim());
    }
    const query = search.toString();
    router.push(`/registry/${owner}/${name}${query ? `?${query}` : ""}`);
  }

  function handleStoryChange(nextStoryId: string | null) {
    const normalizedNextStoryId = nextStoryId?.trim() || null;
    setSelectedStoryId(normalizedNextStoryId);

    const search = new URLSearchParams();
    if (project?.trim()) {
      search.set("project", project.trim());
    }
    if (
      localSelectedVersion.trim() &&
      localSelectedVersion.trim() !== currentVersion
    ) {
      search.set("v", localSelectedVersion.trim());
    }
    if (normalizedNextStoryId) {
      search.set("story", normalizedNextStoryId);
    }
    const query = search.toString();
    router.replace(`/registry/${owner}/${name}${query ? `?${query}` : ""}`);
  }

  async function handleDelete() {
    if (deleting) return;
    const confirmed = window.confirm(
      "Delete this component? This removes all versions and cannot be undone.",
    );
    if (!confirmed) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/registry/${owner}/${name}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error || `Delete failed (${res.status})`;
        window.alert(msg);
        return;
      }
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleVisibility() {
    if (!isOwner || togglingVisibility) return;
    const next = localVisibility === "public" ? "private" : "public";
    const confirmed = window.confirm(
      next === "private"
        ? "Only you will be able to view, preview, and install this component. Continue?"
        : "Anyone will be able to view, preview, and install this component. Continue?",
    );
    if (!confirmed) return;
    try {
      setTogglingVisibility(true);
      const res = await fetch(`/api/registry/${owner}/${name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error || `Update failed (${res.status})`;
        window.alert(msg);
        return;
      }
      setLocalVisibility(next);
      router.refresh();
    } finally {
      setTogglingVisibility(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <nav className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Link
              href="/"
              className="hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Browse
            </Link>
            <span aria-hidden>/</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {owner}
            </span>
            <span aria-hidden>/</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {name}
            </span>
          </nav>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {typeLabel}
                </span>
                <span
                  className={
                    localVisibility === "public"
                      ? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  }
                >
                  {localVisibility === "public" ? "Public" : "Private"}
                </span>
                {versions.length > 0 && (
                  <>
                    <span className="text-zinc-400 dark:text-zinc-500">·</span>
                    <span className="rounded bg-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                      v{selectedVersion}
                    </span>
                    {versions.length > 1 && (
                      <select
                        aria-label="Select version"
                        value={localSelectedVersion}
                        onChange={handleVersionChange}
                        className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {versions.map((v) => (
                          <option key={v.version} value={v.version}>
                            v{v.version}
                            {v.version === currentVersion ? " (latest)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>
              <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {title}
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                {description || "—"}
              </p>
              {(dependencies.length > 0 || registryDependencies.length > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Dependencies:
                  </span>
                  {dependencies.map((dep) => (
                    <span
                      key={dep}
                      className="rounded-md bg-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                    >
                      {dep}
                    </span>
                  ))}
                  {registryDependencies.map((ref) => (
                    <span
                      key={ref}
                      className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                    >
                      {ref.startsWith("@") ? ref : `@${ref}`}
                    </span>
                  ))}
                </div>
              )}
              {dependencyDiagnostics.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Preview dependency support
                  </p>
                  <div className="flex flex-col gap-2">
                    {dependencyDiagnostics.map((decision) => (
                      <div
                        key={`${decision.packageName}:${decision.importSpecifier ?? ""}`}
                        className="rounded-2xl border border-zinc-200 bg-zinc-100/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                            {getDependencyDisplayName(decision)}
                          </span>
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {decision.tier}
                          </span>
                          <span
                            className={
                              decision.previewCapability === "prebundle-supported"
                                ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                : decision.previewCapability === "compatible-artifact-supported"
                                  ? "rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                                : decision.previewCapability === "runtime-only"
                                  ? "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                  : "rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200"
                            }
                          >
                            {decision.previewCapability}
                          </span>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                            {decision.requestedVersion
                              ? `v${decision.requestedVersion}`
                              : "version unknown"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {decision.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewStories.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Story:
                  </span>
                  <select
                    aria-label="Select story"
                    value={selectedStoryId ?? ""}
                    onChange={(event) => {
                      const next = event.target.value.trim();
                      handleStoryChange(next.length > 0 ? next : null);
                    }}
                    className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {previewStories.map((story) => (
                      <option key={story.id} value={story.id}>
                        {story.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Preview
              </Link>
              {previewStories.length > 1 ? (
                <Link
                  href={storiesPreviewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Stories
                </Link>
              ) : null}
              {isOwner && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleToggleVisibility}
                  disabled={togglingVisibility}
                >
                  {togglingVisibility
                    ? "Updating…"
                    : localVisibility === "public"
                      ? "Make private"
                      : "Make public"}
                </Button>
              )}
              {isOwner && (
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Delete component"}
                </Button>
              )}
              <Button variant="default" size="lg" onClick={handleCopy}>
                {copied ? "Copied" : "Copy code"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {type === "registry:theme" && <ThemeTokensTable files={files} />}

        {files.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Files
            </h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60%] text-zinc-500 dark:text-zinc-400">
                      Path
                    </TableHead>
                    <TableHead className="w-[20%] text-zinc-500 dark:text-zinc-400">
                      Type
                    </TableHead>
                    <TableHead className="w-[20%] text-right text-zinc-500 dark:text-zinc-400">
                      Lines
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((f) => {
                    const lines =
                      typeof f.content === "string"
                        ? f.content.split("\n").length
                        : 0;
                    return (
                      <TableRow key={f.path}>
                        <TableCell className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                          {f.path}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                          {f.type.replace("registry:", "")}
                        </TableCell>
                        <TableCell className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                          {lines || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {propsFromCode.length > 0 && type !== "registry:theme" && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Props
            </h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80 hover:bg-zinc-50 dark:hover:bg-zinc-900/80">
                    <TableHead className="text-zinc-500 dark:text-zinc-400">
                      Name
                    </TableHead>
                    <TableHead className="text-zinc-500 dark:text-zinc-400">
                      Type
                    </TableHead>
                    <TableHead className="text-zinc-500 dark:text-zinc-400">
                      Optional
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propsFromCode.map((p) => (
                    <TableRow
                      key={p.name}
                      className="border-zinc-100 dark:border-zinc-800"
                    >
                      <TableCell className="font-mono text-zinc-800 dark:text-zinc-200">
                        {p.name}
                      </TableCell>
                      <TableCell className="font-mono text-zinc-600 dark:text-zinc-400">
                        {p.type}
                      </TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400">
                        {p.optional ? "Yes" : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        <section className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {isTheme ? "Theme preview" : "Component preview"}
              </h2>
              {artifactStatusLabel ? (
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${artifactStatusTone}`}
                >
                  {artifactStatusLabel}
                </span>
              ) : null}
              {resolvedThemeLabel ? (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {resolvedThemeLabel}
                </span>
              ) : null}
            </div>
            {!isTheme ? (
              <Link
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              >
                Open in new tab
              </Link>
            ) : null}
          </div>
          {isTheme ? (
            <ThemeTokenEditor
              owner={owner}
              name={name}
              title={title}
              code={code}
              isOwner={isOwner}
              canSave={canEditTheme}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                {previewReady ? (
                  <PreviewFrame
                    title={`${title} preview`}
                    src={previewHref}
                    className="h-[420px] w-full"
                    loadImmediately
                    fitMode="actual"
                    alignY="center"
                  />
                ) : (
                  <div
                    className="flex h-[420px] w-full flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,rgba(250,250,249,0.96),rgba(244,244,245,0.98))] dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))]"
                    aria-busy="true"
                    aria-live="polite"
                  >
                    <div
                      className="h-9 w-9 animate-spin rounded-full border-2 border-zinc-300/80 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-100"
                      aria-hidden
                    />
                    <p className="text-xs font-medium tracking-wide text-zinc-500 dark:text-zinc-400">
                      Building preview…
                    </p>
                  </div>
                )}
              </div>
              {artifactStatusMessage ? (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {artifactStatusMessage}
                </p>
              ) : null}
            </>
          )}
        </section>

        {versions.length > 0 && (
          <section className="mb-8 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Version history
              </h2>
              {selectedVersion !== currentVersion && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                  Viewing v{selectedVersion}; latest is v{currentVersion}
                </span>
              )}
            </div>
            <ul className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {versions.map((v) => {
                const date =
                  v.createdAt instanceof Date
                    ? v.createdAt
                    : new Date(v.createdAt);
                const isLatest = v.version === currentVersion;
                return (
                  <li
                    key={v.version}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-100">
                        v{v.version}
                      </span>
                      {isLatest && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
                          Latest
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col items-end gap-0.5 text-right">
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {date.toLocaleString()}
                      </span>
                      {v.createdBy && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          by {v.createdBy}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mb-8 space-y-4">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {isTheme ? "Use in projects or design tools" : "Use in your project"}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {isTheme ? (
              <>
                Export this theme as CSS or as W3C-compatible Design Tokens JSON for design tools, build scripts, or your style system.
                <span className="mt-1 block text-zinc-500 dark:text-zinc-500">
                  Coordinate:{" "}
                  <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
                    @{owner}/{name}
                  </code>
                  . To pin a version, append{" "}
                  <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">?v=x.y.z</code> to the install command below.
                </span>
              </>
            ) : (
              <>
                Coordinate:{" "}
                <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
                  @{owner}/{name}
                </code>
                , or copy the code below into your project.
                {versions.length > 1 && (
                  <span className="mt-1 block text-zinc-500 dark:text-zinc-500">
                    After choosing a version, the install command includes{" "}
                    <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">?v=x.y.z</code> so you can pin or upgrade later.
                  </span>
                )}
              </>
            )}
          </p>
          <div>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              {isTheme
                ? "Themes can be distributed via the registry URL. If you use the shadcn registry flow, copy and run this command."
                : "shadcn CLI (install shadcn first): copy the command and run it at your project root"}
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-zinc-800 dark:text-zinc-200">
                {shadcnCommand}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleCopyCommand}
              >
                {copiedCmd ? "Copied" : "Copy command"}
              </Button>
            </div>
            {!installUrl && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">NEXT_PUBLIC_APP_URL</code> when deploying to show a full, runnable command.
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {isTheme ? "CSS source" : "TSX"}
            </span>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <CodeBlock code={code} language={isTheme ? "css" : "tsx"} />
        </section>
      </main>
    </div>
  );
}
