"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { extractPropsFromTsx } from "@/lib/validate-tsx";
import { PreviewFrame } from "@/app/components/PreviewFrame";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectItemRow } from "@/lib/project-items";
import { REGISTRY_THEME_TYPE, normalizeRegistryItemType } from "@/lib/registry-types";
import type { PreviewStory } from "@/lib/preview-stories";
import {
  buildMultiStoryPreviewPageUrl,
  buildStoryPreviewPageUrl,
} from "@/lib/story-preview-urls";
import {
  buildArtifactDeliverySummary,
  getProjectItemTypeIcon,
  isCodeFile,
  resolveProjectItemPreviewStories,
  resolveSelectedPreviewStoryId,
} from "./helpers";
import type {
  PreviewArtifactStatusPayload,
  Project,
  ProjectItemDetailData,
  WarmPreviewSlot,
} from "./types";

const CodeBlock = dynamic(
  () => import("@/app/registry/[owner]/[name]/CodeBlock").then((mod) => mod.CodeBlock),
  {
    loading: () => <div className="text-xs text-zinc-500 dark:text-zinc-400">Loading code...</div>,
  },
);

type ProjectDetailViewProps = {
  registryOwner: string;
  initialProjectTitle?: string;
  initialProjectSlug?: string;
  initialProjectVisibility?: "public" | "private";
  canEditProject: boolean;
  selectedProject: Project | null;
  currentProjectNamespaceKey: string | null;
  projectItems: ProjectItemRow[];
  selectedItemId: string | null;
  onSelectProjectItem: (itemId: string) => void;
  onOpenMoveDialog: (itemId: string) => void;
  onOpenRemoveDialog: (itemId: string) => void;
  onSetProjectDefaultThemeRef: (item: ProjectItemRow) => void;
  detailByItemId: Record<string, ProjectItemDetailData>;
  artifactStatusByItemId: Record<string, PreviewArtifactStatusPayload | null>;
  detailTab: "preview" | "code";
  onDetailTabChange: (tab: "preview" | "code") => void;
  selectedPath: string | null;
  onSelectedPathChange: (path: string) => void;
  selectedProjectPreviewStories: {
    stories: PreviewStory[];
    defaultStoryId: string | null;
  };
  selectedProjectStoryId: string | null;
  selectedStoryIdByItemId: Record<string, string | null>;
  onSelectedStoryIdChange: (itemId: string, storyId: string | null) => void;
  previewSlotsToRender: WarmPreviewSlot[];
  itemDetailLoadingId: string | null;
  itemDetailError: string | null;
  itemActionPending: "remove" | "move" | "set-default-theme-ref" | null;
  itemActionError: string | null;
};

export function ProjectDetailView(props: ProjectDetailViewProps) {
  const selectedItem = props.projectItems.find((item) => item.itemId === props.selectedItemId) ?? null;
  const selectedDetail = props.selectedItemId ? props.detailByItemId[props.selectedItemId] ?? null : null;
  const artifactStatus = props.selectedItemId
    ? props.artifactStatusByItemId[props.selectedItemId] ?? null
    : null;
  const preferredFile =
    selectedDetail?.files.find((file) => file.path === props.selectedPath) ??
    selectedDetail?.files.find((file) => /\.(tsx?|jsx?)$/i.test(file.path)) ??
    selectedDetail?.files.find((file) => isCodeFile(file.path)) ??
    selectedDetail?.files[0] ??
    null;
  const code = preferredFile?.content ?? "";
  const propsFromCode =
    selectedDetail?.type === "registry:theme" || !code ? [] : extractPropsFromTsx(code);
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
  const artifactStatusMessage = buildArtifactDeliverySummary(artifactStatus);
  const resolvedThemeRefs = artifactStatus?.resolvedThemeResourceRefs ?? [];
  const resolvedThemeLabel =
    resolvedThemeRefs.length > 0
      ? `Theme layers: ${resolvedThemeRefs.join(" -> ")}`
      : artifactStatus?.resolvedThemeSource === "none"
        ? "No resolved theme"
        : null;
  const storiesPreviewHref =
    selectedItem && props.selectedProjectPreviewStories.stories.length
      ? buildMultiStoryPreviewPageUrl({
          owner: props.registryOwner,
          name: selectedItem.name,
          project: props.currentProjectNamespaceKey,
          storyId: props.selectedProjectStoryId,
        })
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {props.selectedProject?.title ?? props.initialProjectTitle ?? "Project"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              Slug{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {props.selectedProject?.slug ?? props.initialProjectSlug ?? "unknown"}
              </code>
            </span>
            <span>·</span>
            <span>{props.selectedProject?.visibility ?? props.initialProjectVisibility ?? "private"}</span>
            <span>·</span>
            <span className="font-mono">{props.selectedProject?.namespaceKey ?? "project"}</span>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-b border-zinc-200/80 lg:border-r lg:border-b-0 dark:border-zinc-800">
          <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
            {props.projectItems.map((item) => {
              const active = item.itemId === props.selectedItemId;
              const typeIcon = getProjectItemTypeIcon(item.type);
              const isThemeResource = normalizeRegistryItemType(item.type) === REGISTRY_THEME_TYPE;
              const candidateDefaultThemeRef = `@${props.registryOwner}/${item.name}`;
              const isCurrentProjectDefaultTheme = (
                props.selectedProject?.defaultThemeResourceRefs ?? []
              ).includes(candidateDefaultThemeRef);

              return (
                <ContextMenu
                  key={item.itemId}
                  onOpenChange={(open) => {
                    if (open) props.onSelectProjectItem(item.itemId);
                  }}
                >
                  <ContextMenuTrigger>
                    <button
                      type="button"
                      onClick={() => props.onSelectProjectItem(item.itemId)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-700 hover:bg-zinc-100/80 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${typeIcon.className}`}
                          aria-hidden="true"
                        >
                          <HugeiconsIcon icon={typeIcon.icon} size={18} strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {item.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {item.name}
                          </p>
                        </div>
                      </div>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-52">
                    <ContextMenuLabel className="truncate">{item.title}</ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      disabled={!props.canEditProject || props.itemActionPending !== null}
                      onClick={() => props.onOpenMoveDialog(item.itemId)}
                    >
                      Move resource
                    </ContextMenuItem>
                    <ContextMenuItem
                      variant="destructive"
                      disabled={!props.canEditProject || props.itemActionPending !== null}
                      onClick={() => props.onOpenRemoveDialog(item.itemId)}
                    >
                      Delete resource
                    </ContextMenuItem>
                    {isThemeResource ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          disabled={
                            !props.canEditProject ||
                            props.itemActionPending !== null ||
                            isCurrentProjectDefaultTheme
                          }
                          onClick={() => props.onSetProjectDefaultThemeRef(item)}
                        >
                          {isCurrentProjectDefaultTheme
                            ? "Already project default source ref"
                            : "Set as project default source ref"}
                        </ContextMenuItem>
                      </>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedItem?.title ?? "Select a resource"}
                </p>
                {selectedItem ? (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {props.currentProjectNamespaceKey
                      ? `${props.registryOwner} / ${props.currentProjectNamespaceKey} / ${selectedItem.name}`
                      : `${props.registryOwner} / ${selectedItem.name}`}
                  </p>
                ) : null}
                {artifactStatusLabel && props.detailTab === "preview" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${artifactStatusTone}`}
                    >
                      {artifactStatusLabel}
                    </span>
                    {resolvedThemeLabel ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {resolvedThemeLabel}
                      </span>
                    ) : null}
                    {artifactStatusMessage ? (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {artifactStatusMessage}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {props.detailTab === "preview" && props.selectedProjectPreviewStories.stories.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Story:</span>
                    <select
                      aria-label="Select story"
                      value={props.selectedProjectStoryId ?? ""}
                      onChange={(event) => {
                        if (!selectedItem) return;
                        const next = event.target.value.trim();
                        props.onSelectedStoryIdChange(selectedItem.itemId, next.length > 0 ? next : null);
                      }}
                      className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {props.selectedProjectPreviewStories.stories.map((story) => (
                        <option key={story.id} value={story.id}>
                          {story.title}
                        </option>
                      ))}
                    </select>
                    {props.selectedProjectPreviewStories.stories.length > 1 && storiesPreviewHref ? (
                      <Link
                        href={storiesPreviewHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        Open stories page
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {selectedItem ? (
                <div className="flex shrink-0 items-center gap-2">
                  {props.canEditProject ? (
                    <>
                      <button
                        type="button"
                        onClick={() => props.onOpenMoveDialog(selectedItem.itemId)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Move
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onOpenRemoveDialog(selectedItem.itemId)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                  {props.canEditProject && props.itemActionError ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{props.itemActionError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {selectedItem ? (
            <div className="border-b border-zinc-200/80 px-4 py-2 dark:border-zinc-800">
              <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100/80 p-1 dark:bg-zinc-900">
                {(["preview", "code"] as const).map((tab) => {
                  const active = props.detailTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => props.onDetailTabChange(tab)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                      }`}
                    >
                      {tab === "preview" ? "Preview" : "Code"}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!selectedItem ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-zinc-500">
              Select a resource to preview.
            </div>
          ) : (
            <>
              <div
                className={`relative isolate min-h-0 flex-1 ${props.detailTab !== "preview" ? "hidden" : ""}`}
                aria-hidden={props.detailTab !== "preview"}
              >
                {props.previewSlotsToRender.map((slot) => {
                  const isActive =
                    selectedItem.itemId === slot.itemId &&
                    props.currentProjectNamespaceKey === slot.projectKey;
                  const slotDetail = props.detailByItemId[slot.itemId] ?? null;
                  const slotProjectItem =
                    props.projectItems.find((item) => item.itemId === slot.itemId) ?? null;
                  const slotPreviewStories = resolveProjectItemPreviewStories({
                    itemMeta: slotProjectItem?.meta ?? null,
                    detail: slotDetail,
                  });
                  const slotStoryId =
                    slotPreviewStories.stories.length > 0
                      ? resolveSelectedPreviewStoryId({
                          currentStoryId: isActive
                            ? props.selectedStoryIdByItemId[slot.itemId] ?? null
                            : null,
                          stories: slotPreviewStories.stories,
                          defaultStoryId: slotPreviewStories.defaultStoryId,
                        })
                      : null;
                  const src =
                    slotPreviewStories.stories.length > 1
                      ? buildMultiStoryPreviewPageUrl({
                          owner: props.registryOwner,
                          name: slot.name,
                          project: slot.projectKey,
                          storyId: slotStoryId,
                        })
                      : buildStoryPreviewPageUrl({
                          owner: props.registryOwner,
                          name: slot.name,
                          project: slot.projectKey,
                          storyId: slotStoryId,
                        });

                  return (
                    <div
                      key={`${slot.itemId}:${slot.projectKey ?? ""}`}
                      className="absolute inset-0 overflow-hidden"
                      style={{
                        opacity: isActive ? 1 : 0,
                        pointerEvents: isActive ? "auto" : "none",
                        zIndex: isActive ? 2 : 0,
                        visibility: "visible",
                      }}
                      aria-hidden={!isActive}
                    >
                      <PreviewFrame
                        src={src}
                        title={`${slot.title} preview`}
                        className="h-full w-full"
                        interactive={isActive && props.detailTab === "preview"}
                        alignX="left"
                        alignY="top"
                        fitMode="actual"
                        loadImmediately
                      />
                    </div>
                  );
                })}
              </div>

              <div
                className={`grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] ${
                  props.detailTab !== "code" ? "hidden" : ""
                }`}
                aria-hidden={props.detailTab !== "code"}
              >
                <div className="min-h-0 overflow-auto border-r border-zinc-200/80 p-2 dark:border-zinc-800">
                  {props.itemDetailLoadingId === selectedItem.itemId && !selectedDetail ? (
                    <p className="text-xs text-zinc-500">Loading...</p>
                  ) : selectedDetail?.files.length ? (
                    <div className="space-y-1">
                      {selectedDetail.files.map((file) => (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => props.onSelectedPathChange(file.path)}
                          className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
                            (props.selectedPath
                              ? props.selectedPath === file.path
                              : preferredFile?.path === file.path)
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {file.path}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">{props.itemDetailError ?? "No files to show"}</p>
                  )}
                </div>

                <div className="min-h-0 overflow-auto">
                  {props.itemDetailError && !selectedDetail ? (
                    <div className="flex min-h-[220px] items-center justify-center px-4 text-sm text-amber-600 dark:text-amber-400">
                      {props.itemDetailError}
                    </div>
                  ) : (
                    <CodeBlock
                      code={code || "// source unavailable"}
                      language={
                        preferredFile?.path?.endsWith(".css")
                          ? "css"
                          : preferredFile?.path?.endsWith(".json")
                            ? "json"
                            : "tsx"
                      }
                      variant="flush"
                      overflowMode="narrow"
                    />
                  )}

                  {propsFromCode.length > 0 ? (
                    <div className="border-t border-zinc-200/80 p-3 dark:border-zinc-800">
                      <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Props
                      </p>
                      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Optional</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {propsFromCode.map((prop) => (
                              <TableRow key={prop.name}>
                                <TableCell className="font-mono">{prop.name}</TableCell>
                                <TableCell className="font-mono">{prop.type}</TableCell>
                                <TableCell>{prop.optional ? "Yes" : "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
